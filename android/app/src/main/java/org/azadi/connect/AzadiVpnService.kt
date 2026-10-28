package org.azadi.connect

import android.app.*
import android.content.Intent
import android.net.*
import android.os.*
import androidx.core.app.NotificationCompat
import io.nekohasekai.libbox.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

class AzadiVpnService : VpnService() {
    companion object { const val STOP = "org.azadi.connect.STOP"; const val TIMER = "org.azadi.connect.TIMER" }
    private val guard = SessionGuard(Tunnel.owner)
    private val workDirectory get() = File(cacheDir, "core-" + guard.id)
    private val dispatcher = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private var server: CommandServer? = null
    private var descriptor: ParcelFileDescriptor? = null
    private var session: Job? = null
    @Volatile private var stopping = false
    @Volatile private var timerSession = UUID.randomUUID().toString()
    @Volatile private var latestStartId = 0
    private var profile: Profile? = null
    private var port = 0
    private var secret = ""
    private val monitor = AtomicReference<InterfaceUpdateListener?>()
    private lateinit var connectivity: ConnectivityManager
    private var callback: ConnectivityManager.NetworkCallback? = null
    private val store get() = (application as AzadiApplication).vault
    private val fa get() = store.data.value.language == "fa"
    override fun onCreate() {
        super.onCreate()
        connectivity = getSystemService(ConnectivityManager::class.java)
        getSystemService(AlarmManager::class.java).cancel(timerIntent())
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("tunnel", "VPN connection", NotificationManager.IMPORTANCE_LOW))
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        latestStartId = startId
        when (intent?.action) {
            STOP -> {
                if (guard.acceptsTimer(intent.getStringExtra("timer_session"), timerSession)) {
                    stopping = true; session?.cancel(); scope.launch { disconnect(); stopSelfResult(startId) }
                } else if (session?.isActive != true) stopSelf()
            }
            TIMER -> { val minutes = intent.getIntExtra("minutes", 0); if (minutes in 0..1440 && Tunnel.state.value.status == "connected") setTimer(minutes) }
            else -> {
                startForeground(1, notification(if (fa) "در حال اتصال…" else "Connecting…"))
                if (session?.isActive != true) { stopping = false; timerSession = UUID.randomUUID().toString(); session = scope.launch { connect() } }
            }
        }
        return START_NOT_STICKY
    }
    private fun publish(state: TunnelState) { if (guard.isCurrent) Tunnel.state.value = state }
    private fun notification(text: String): android.app.Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, AzadiVpnService::class.java).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, "tunnel").setSmallIcon(R.drawable.ic_azadi).setContentTitle("Azadi Connect").setContentText(text).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).addAction(0, if (fa) "قطع اتصال" else "Disconnect", stop).build()
    }
    private suspend fun connect() {
        var stage = "profile"
        try {
            check(!(application as AzadiApplication).startupError) { "Vault is unavailable" }
            currentCoroutineContext().ensureActive()
            val data = store.connectionSnapshot { snapshot -> publish(TunnelState("connecting", snapshot.profiles.find { it.id == snapshot.selectedId }?.name.orEmpty())) }
            currentCoroutineContext().ensureActive()
            check(guard.isCurrent) { "Session superseded" }
            val selected = data.profiles.find { it.id == data.selectedId } ?: error("Select a profile first")
            profile = selected
            require(data.mode != "apps" || data.apps.isNotEmpty()) { "Select applications first" }
            check(prepare(this) == null) { "VPN permission is required" }
            publish(TunnelState("connecting", selected.name))
            stage = "core"
            cacheDir.listFiles()?.filter { it.isDirectory && (it.name == "core" || it.name.startsWith("core-")) && it != workDirectory }?.forEach { it.deleteRecursively() }
            val work = workDirectory.apply { mkdirs() }
            secret = UUID.randomUUID().toString() + UUID.randomUUID().toString()
            Libbox.setup(SetupOptions().apply { basePath = filesDir.absolutePath; workingPath = work.absolutePath; tempPath = work.absolutePath; commandServerSecret = secret; logMaxLines = 100; appVersion = BuildConfig.VERSION_NAME; crashReportSource = "android" })
            port = ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).use { it.localPort }
            val config = Config.build(selected, port, secret)
            Libbox.checkConfig(config)
            val handlers = object : CommandServerHandler {
                override fun serviceStop() { requestStop() }
                override fun serviceReload() { requestStop() }
                override fun getSystemProxyStatus() = SystemProxyStatus()
                override fun setSystemProxyEnabled(enabled: Boolean) { check(!enabled) }
                override fun triggerNativeCrash() { error("Unsupported") }
                override fun writeDebugMessage(message: String?) {}
                override fun connectSSHAgent(): Int = error("Unsupported")
            }
            stage = "tunnel"
            server = Libbox.newCommandServer(handlers, platform())
            server!!.startOrReloadService(config, OverrideOptions())
            currentCoroutineContext().ensureActive()
            stage = "verification"
            var verified: Long? = null
            for (target in listOf("https://1.1.1.1/cdn-cgi/trace", "https://www.gstatic.com/generate_204")) {
                currentCoroutineContext().ensureActive()
                verified = runCatching { probe(target) }.getOrNull()
                if (verified != null) break
            }
            check(verified != null) { "VPN outbound could not be verified" }
            currentCoroutineContext().ensureActive()
            if (stopping) return
            publish(TunnelState("connected", selected.name, SystemClock.elapsedRealtime(), latency = verified))
            getSystemService(NotificationManager::class.java).notify(1, notification(if (fa) "اتصال تأیید شد · ${selected.name}" else "Verified · ${selected.name}"))
            var ticks = 0; var healthFailures = 0
            while (currentCoroutineContext().isActive && !stopping) {
                delay(1500)
                val old = Tunnel.state.value
                if (SessionDeadline.expired(old.deadline, SystemClock.elapsedRealtime())) { requestStop(); break }
                val totals = runCatching { api("/connections") }.getOrNull()
                if (totals != null) publish(Tunnel.state.value.copy(upload = totals.optLong("uploadTotal"), download = totals.optLong("downloadTotal")))
                if (++ticks % 15 == 0) {
                    val latency = runCatching { probe("https://1.1.1.1/cdn-cgi/trace") }.getOrNull()
                    if (latency == null) healthFailures++ else healthFailures = 0
                    check(healthFailures < 2) { "VPN health check failed" }
                    publish(Tunnel.state.value.copy(latency = latency))
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            stopping = true
            val detail = Diagnostics.safe("stage=$stage\n" + (e.message ?: e.javaClass.simpleName).replace(secret.takeIf { it.isNotEmpty() } ?: "\u0000", "[redacted]"), profile)
            disconnect(false)
            publish(Tunnel.state.value.copy(status = "error", latency = null, deadline = 0, error = detail))
            stopSelf()
        }
    }
    private fun api(route: String): JSONObject {
        val c = URL("http://127.0.0.1:$port$route").openConnection() as HttpURLConnection
        try { c.connectTimeout = 4000; c.readTimeout = 11000; c.setRequestProperty("Authorization", "Bearer $secret"); check(c.responseCode == 200) { "Engine API ${c.responseCode}" }; return JSONObject(c.inputStream.use { input -> val out = java.io.ByteArrayOutputStream(); val b = ByteArray(8192); while (true) { val n = input.read(b); if (n < 0) break; check(out.size() + n <= 2 * 1024 * 1024); out.write(b, 0, n) }; out.toString("UTF-8") }) } finally { c.disconnect() }
    }
    private fun probe(target: String): Long {
        val d = api("/proxies/vpn/delay?timeout=8000&url=" + java.net.URLEncoder.encode(target, "UTF-8"))
        check(d.has("delay") && d.getDouble("delay").isFinite() && d.getDouble("delay") >= 0) { "Invalid VPN probe response" }
        return d.getLong("delay")
    }
    private fun requestStop() { if (stopping) return; stopping = true; session?.cancel(); val id = latestStartId; scope.launch { disconnect(); stopSelfResult(id) } }
    private fun timerIntent() = PendingIntent.getService(this, 2, Intent(this, AzadiVpnService::class.java).setAction(STOP).putExtra("timer_session", timerSession), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun setTimer(minutes: Int) {
        val alarm = getSystemService(AlarmManager::class.java); alarm.cancel(timerIntent())
        val deadline = SessionDeadline.fromMinutes(minutes, SystemClock.elapsedRealtime())
        publish(Tunnel.state.value.copy(deadline = deadline))
        if (deadline > 0) alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline, timerIntent())
    }
    private fun disconnect(reset: Boolean = true) {
        if (guard.isCurrent) runCatching { getSystemService(AlarmManager::class.java).cancel(timerIntent()) }
        runCatching { server?.closeService() }; runCatching { server?.close() }; server = null
        runCatching { descriptor?.close() }; descriptor = null
        callback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }; callback = null; monitor.set(null)
        workDirectory.deleteRecursively()
        if (reset) publish(TunnelState())
        if (guard.isCurrent) stopForeground(STOP_FOREGROUND_REMOVE)
    }
    private fun underlying(): Network? = connectivity.allNetworks.filter { n -> connectivity.getNetworkCapabilities(n)?.let { it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && it.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN) } == true }.sortedByDescending { connectivity.getNetworkCapabilities(it)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true }.firstOrNull()
    private fun updateNetwork() {
        if (!guard.isCurrent) return
        val net = underlying()
        setUnderlyingNetworks(net?.let { arrayOf(it) })
        val name = net?.let { connectivity.getLinkProperties(it)?.interfaceName }.orEmpty()
        val index = runCatching { java.net.NetworkInterface.getByName(name)?.index ?: -1 }.getOrDefault(-1)
        monitor.get()?.updateDefaultInterface(name, index, net?.let { connectivity.isActiveNetworkMetered } ?: false, false)
    }
    private fun platform() = object : PlatformInterface {
        override fun usePlatformAutoDetectInterfaceControl() = true
        override fun autoDetectInterfaceControl(fd: Int) { check(protect(fd)) { "Could not protect outbound socket" } }
        override fun openTun(options: TunOptions): Int {
            check(prepare(this@AzadiVpnService) == null) { "VPN permission was revoked" }
            val data = store.data.value
            val b = Builder().setSession("Azadi Connect").setMtu(options.mtu).addDnsServer("172.29.215.2")
            val v4 = options.inet4Address; while (v4.hasNext()) { val a = v4.next(); b.addAddress(a.address(), a.prefix()) }
            val v6 = options.inet6Address; while (v6.hasNext()) { val a = v6.next(); b.addAddress(a.address(), a.prefix()) }
            b.addRoute("0.0.0.0", 0); b.addRoute("::", 0)
            if (Build.VERSION.SDK_INT >= 29) b.setMetered(false)
            if (data.mode == "apps") { check(data.apps.isNotEmpty()); data.apps.forEach { b.addAllowedApplication(it) } }
            descriptor = b.establish() ?: error("VPN could not be established")
            return descriptor!!.fd
        }
        override fun useProcFS() = false
        override fun findConnectionOwner(protocol: Int, source: String?, sourcePort: Int, destination: String?, destinationPort: Int): ConnectionOwner = error("Application routing uses Android VPN UID rules")
        override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {
            monitor.set(listener)
            callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { updateNetwork() }
                override fun onLost(network: Network) { updateNetwork() }
                override fun onLinkPropertiesChanged(network: Network, lp: LinkProperties) { updateNetwork() }
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) { updateNetwork() }
            }.also { connectivity.registerNetworkCallback(NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build(), it) }
            updateNetwork()
        }
        override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) { callback?.let { connectivity.unregisterNetworkCallback(it) }; callback = null; monitor.set(null) }
        override fun getInterfaces(): NetworkInterfaceIterator {
            val items = connectivity.allNetworks.mapNotNull { net ->
                val lp = connectivity.getLinkProperties(net) ?: return@mapNotNull null
                val caps = connectivity.getNetworkCapabilities(net) ?: return@mapNotNull null
                if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)) return@mapNotNull null
                val iface = java.net.NetworkInterface.getByName(lp.interfaceName) ?: return@mapNotNull null
                NetworkInterface().apply {
                    name = lp.interfaceName; index = iface.index; mtu = iface.mtu; flags = 65
                    addresses = Strings(lp.linkAddresses.mapNotNull { it.address.hostAddress?.substringBefore('%')?.let { a -> "$a/${it.prefixLength}" } })
                    dnsServer = Strings(lp.dnsServers.mapNotNull { it.hostAddress })
                    type = when { caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Libbox.InterfaceTypeWIFI; caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Libbox.InterfaceTypeCellular; else -> Libbox.InterfaceTypeOther }
                    metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                }
            }.iterator()
            return object : NetworkInterfaceIterator { override fun hasNext() = items.hasNext(); override fun next() = items.next() }
        }
        override fun localDNSTransport(): LocalDNSTransport? = null
        override fun underNetworkExtension() = false
        override fun includeAllNetworks() = false
        override fun readWIFIState(): WIFIState? = null
        override fun clearDNSCache() {}
        override fun sendNotification(notification: io.nekohasekai.libbox.Notification?) {}
        override fun cancelNotification(identifier: String?, typeID: Int) {}
        override fun startNeighborMonitor(listener: NeighborUpdateListener?) {}
        override fun closeNeighborMonitor(listener: NeighborUpdateListener?) {}
        override fun registerMyInterface(name: String?) {}
        override fun usePlatformShell() = false
        override fun checkPlatformShell() { error("Unsupported") }
        override fun openShellSession(user: PlatformUser?, command: String?, env: StringIterator?, term: String?, rows: Int, cols: Int): ShellSession = error("Unsupported")
        override fun lookupUser(username: String?): PlatformUser = error("Unsupported")
        override fun lookupSFTPServer(): String = error("Unsupported")
        override fun readSystemSSHHostKey(): String = error("Unsupported")
        override fun tailscaleHostname() = "Azadi-Android"
        override fun usePlatformBridge() = false
        override fun createBridge(options: BridgeOptions?): BridgeSession = error("Unsupported")
    }
    override fun onRevoke() { requestStop(); super.onRevoke() }
    override fun onDestroy() {
        stopping = true; session?.cancel()
        scope.launch { disconnect(Tunnel.state.value.status != "error"); scope.cancel(); dispatcher.close() }
        super.onDestroy()
    }
}
class Strings(values: List<String>) : StringIterator {
    private val iterator = values.iterator()
    private val count = values.size
    override fun len() = count
    override fun hasNext() = iterator.hasNext()
    override fun next(): String = iterator.next()
}
