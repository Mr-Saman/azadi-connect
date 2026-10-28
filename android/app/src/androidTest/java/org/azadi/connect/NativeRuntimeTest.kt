package org.azadi.connect

import android.content.ContextWrapper
import android.content.Intent
import android.net.VpnService
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.SetupOptions
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.Base64

@RunWith(AndroidJUnit4::class)
class NativeRuntimeTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    @Test fun nativeEngineAcceptsAllImportedProtocols() {
        val work = File(context.cacheDir, "native-config-test").apply { mkdirs() }
        Libbox.setup(SetupOptions().apply { basePath = work.path; workingPath = work.path; tempPath = work.path; commandServerSecret = "synthetic-test-only"; logMaxLines = 20 })
        val id = "bf000d23-0752-40b4-affe-68f7707a9661"; val key = Base64.getEncoder().encodeToString(ByteArray(32) { 1 })
        val ca = instrumentation.context.assets.open("ca.txt").bufferedReader().use { it.readText() }
        val inputs = listOf(
            "[Interface]\nPrivateKey=$key\nAddress=10.1.1.2/32\n[Peer]\nPublicKey=$key\nEndpoint=192.0.2.1:51820\nAllowedIPs=0.0.0.0/0,::/0",
            "vless://$id@example.com:443?security=tls&type=ws&path=%2Fvpn",
            "vless://$id@example.com:443?security=reality&pbk=" + key.replace("=", "").replace('+', '-').replace('/', '_') + "&sid=abcd",
            "vmess://" + Base64.getEncoder().encodeToString(obj("add" to "example.com", "port" to 443, "id" to id, "aid" to 0, "net" to "tcp", "tls" to "tls").toString().toByteArray()),
            "ss://" + Base64.getEncoder().encodeToString("aes-256-gcm:test-password".toByteArray()) + "@example.com:8388",
            "trojan://test-password@example.com:443", "hy2://test-password@example.com:443",
            "tuic://$id:test-password@example.com:443", "socks5://example.com:1080", "https://example.com:443",
            "client\ndev tun\nremote example.com 1194\nproto udp\n<ca>\n$ca\n</ca>"
        )
        inputs.forEach { input ->
            val profile = Profiles.import(input).single()
            Libbox.checkConfig(Config.build(profile, 19090, "x".repeat(64)))
        }
        work.deleteRecursively()
    }
    @Test fun keystoreVaultRoundTripsAndRejectsTamperingWithoutOverwriting() {
        val directory = File(context.cacheDir, "vault-test").apply { deleteRecursively(); mkdirs() }
        val wrapper = object : ContextWrapper(context) { override fun getFilesDir() = directory }
        val vault = Vault(wrapper); val p = Profiles.import("socks5://test-user:synthetic-secret@example.com").single()
        vault.import(listOf(p))
        val file = File(directory, "profiles.aes")
        assertFalse(String(file.readBytes(), Charsets.ISO_8859_1).contains("synthetic-secret"))
        assertEquals(p, Vault(wrapper).data.value.profiles.single())
        val backup = File(file.path + ".bak")
        assertTrue(file.renameTo(backup))
        assertEquals("Legacy interrupted writes must recover", p, Vault(wrapper).data.value.profiles.single())
        assertTrue(file.exists())
        assertFalse(backup.exists())
        val previous = Tunnel.state.value
        try {
            val snapshot = vault.connectionSnapshot { Tunnel.state.value = TunnelState("connecting") }
            assertEquals(p, snapshot.profiles.single())
            assertTrue(runCatching { vault.update { it.copy(mode = "apps") } }.isFailure)
            vault.update { it.copy(dark = false) }
            assertFalse(vault.data.value.dark)
        } finally { Tunnel.state.value = previous }
        val bytes = file.readBytes(); bytes[bytes.lastIndex] = (bytes.last().toInt() xor 1).toByte(); file.writeBytes(bytes)
        assertTrue(runCatching { Vault(wrapper) }.isFailure)
        assertArrayEquals(bytes, file.readBytes())
        directory.deleteRecursively()
    }
    @Test fun failedEndpointNeverBecomesVerified() {
        // Opt in only on an isolated test device: this test changes its active VPN.
        assumeTrue(InstrumentationRegistry.getArguments().getString("allowVpnTest") == "true")
        val app = context.applicationContext as AzadiApplication
        val old = app.vault.data.value
        instrumentation.uiAutomation.executeShellCommand("appops set ${context.packageName} ACTIVATE_VPN allow").use { fd -> android.os.ParcelFileDescriptor.AutoCloseInputStream(fd).readBytes() }
        assertNull(VpnService.prepare(context))
        try {
            val profile = Profiles.import("socks5://synthetic-user:synthetic-password@127.0.0.1:9").single()
            app.vault.update { AppData(profiles = listOf(profile), selectedId = profile.id, language = "en") }
            ContextCompat.startForegroundService(context, Intent(context, AzadiVpnService::class.java))
            val end = android.os.SystemClock.elapsedRealtime() + 60000; var started = false
            while (android.os.SystemClock.elapsedRealtime() < end) {
                val state = Tunnel.state.value
                assertNotEquals("connected", state.status)
                if (state.status == "connecting") started = true
                if (started && state.status == "error") break
                Thread.sleep(100)
            }
            assertTrue("VPN service did not start", started)
            assertEquals("error", Tunnel.state.value.status)
            assertTrue("Core must reach its outbound verification stage: " + Tunnel.state.value.error, Tunnel.state.value.error.contains("stage=verification"))
            assertFalse(Tunnel.state.value.error.contains("synthetic-password"))
        } finally {
            context.startService(Intent(context, AzadiVpnService::class.java).setAction(AzadiVpnService.STOP))
            val end = android.os.SystemClock.elapsedRealtime() + 5000
            while (Tunnel.state.value.status in listOf("connecting", "connected") && android.os.SystemClock.elapsedRealtime() < end) Thread.sleep(100)
            app.vault.update { old }
        }
    }
}
