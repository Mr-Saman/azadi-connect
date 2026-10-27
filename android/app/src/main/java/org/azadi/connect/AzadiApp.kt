package org.azadi.connect

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import androidx.core.net.toUri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.text.KeyboardOptions
import androidx.core.graphics.drawable.toBitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

class Words(val fa: Boolean) { operator fun invoke(fa: String, en: String) = if (this.fa) fa else en }
data class InstalledApp(val id: String, val label: String)
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun AzadiApp(vault: Vault, messages: SharedFlow<String>, onConnect: () -> Unit, onFile: (String, String) -> Unit) {
    val context = LocalContext.current
    val data by vault.data.collectAsState()
    val tunnel by Tunnel.state.collectAsState()
    val w = Words(data.language == "fa")
    var page by rememberSaveable { mutableStateOf("home") }
    var importing by remember { mutableStateOf(false) }
    var importingBusy by remember { mutableStateOf(false) }
    var remove by remember { mutableStateOf<Profile?>(null) }
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val updater = remember { AndroidUpdater(context.applicationContext) }
    val update by updater.state.collectAsState()
    val locked = tunnel.status in listOf("connected", "connecting")
    var now by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    fun tell(message: String) { scope.launch { snack.showSnackbar(message, withDismissAction = true) } }
    fun save(change: (AppData) -> AppData) { scope.launch { try { withContext(Dispatchers.IO) { vault.update(change) } } catch (_: Exception) { tell(w("ذخیره‌سازی انجام نشد.", "Could not save securely.")) } } }
    fun connect() {
        if (data.profiles.none { it.id == data.selectedId }) tell(w("ابتدا یک پروفایل انتخاب کن.", "Choose a profile first."))
        else if (data.mode == "apps" && data.apps.isEmpty()) tell(w("حداقل یک برنامه انتخاب کن.", "Choose at least one application."))
        else onConnect()
    }
    fun stop() { context.startService(Intent(context, AzadiVpnService::class.java).setAction(AzadiVpnService.STOP)) }
    LaunchedEffect(data.dark) {
        val style = if (data.dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT) else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
        (context as? ComponentActivity)?.enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }
    LaunchedEffect(Unit) { messages.collect { snack.showSnackbar(it, withDismissAction = true) } }
    var previous by remember { mutableStateOf("disconnected") }
    LaunchedEffect(tunnel.status) {
        if (tunnel.status == "error") tell(w("اتصال تأیید نشد؛ جزئیات را بررسی کن.", "Connection was not verified. See diagnostics."))
        else if (tunnel.status != previous && tunnel.status == "connected") tell(w("اتصال VPN تأیید شد.", "VPN connection verified."))
        previous = tunnel.status
    }
    LaunchedEffect(locked) { while (locked) { now = SystemClock.elapsedRealtime(); delay(1000) } }
    AzadiTheme(data.dark, w.fa) {
        CompositionLocalProvider(LocalLayoutDirection provides if (w.fa) LayoutDirection.Rtl else LayoutDirection.Ltr) {
            Scaffold(containerColor = MaterialTheme.colorScheme.background,
                topBar = {
                    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 22.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .14f)), contentAlignment = Alignment.Center) { Text("A", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Black, fontSize = 23.sp) }
                        Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text("AZADI CONNECT", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold); Text(w("آزادی، همراه تو", "Your connection. Your choice."), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        TextButton(onClick = { save { it.copy(language = if (w.fa) "en" else "fa") } }) { Text(if (w.fa) "EN" else "فا") }
                    }
                },
                bottomBar = {
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                        listOf(Triple("home", Icons.Default.Home, w("اتصال", "Connect")), Triple("profiles", Icons.AutoMirrored.Filled.List, w("پروفایل‌ها", "Profiles")), Triple("apps", Icons.Default.Menu, w("برنامه‌ها", "Apps")), Triple("settings", Icons.Default.Settings, w("تنظیمات", "Settings"))).forEach { (id, icon, label) ->
                            NavigationBarItem(selected = page == id, onClick = { page = id }, icon = { Icon(icon, contentDescription = label) }, label = { Text(label, maxLines = 1, style = MaterialTheme.typography.labelSmall) })
                        }
                    }
                },
                snackbarHost = { SnackbarHost(snack) { item -> Snackbar(Modifier.padding(12.dp), shape = RoundedCornerShape(18.dp), action = { TextButton(onClick = { item.dismiss() }) { Text(w("بستن", "Dismiss")) } }) { Text(item.visuals.message) } } }
            ) { inset ->
                when (page) {
                    "home" -> LazyColumn(Modifier.padding(inset).fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        item { ScreenTitle(w("اتصال، به سبک خودت.", "Connect on your terms."), w("امن، ساده و همیشه در دسترس.", "A little more freedom. Wherever you go.")) }
                        item {
                            Panel {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Text(w("فضای اتصال تو", "YOUR CONNECTION"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    StatusPill(tunnel.status, w)
                                }
                                Orbit(tunnel.status, w, onClick = { if (locked) stop() else connect() })
                                Text(statusTitle(tunnel.status, w), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                                Text(when (tunnel.status) { "connected" -> w("درخواست آزمایشی از خروجی VPN موفق بود.", "A real request through your VPN succeeded."); "connecting" -> w("ساخت تونل و بررسی اتصال واقعی…", "Starting the tunnel and verifying connectivity…"); "error" -> w("سرور، پروفایل و جزئیات خطا را بررسی کن.", "Check your server, profile and diagnostics."); else -> w("پروفایل و مسیر دلخواهت را انتخاب کن.", "Choose a profile and your preferred route.") }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 18.dp))
                                Button(onClick = { if (locked) stop() else connect() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp)) { Text(if (locked) w("قطع اتصال", "Disconnect") else w("اتصال", "Connect"), fontWeight = FontWeight.Bold) }
                                Text(w("بدون حساب کاربری · سرور از خودت", "No account · Bring your own server"), Modifier.fillMaxWidth().padding(top = 12.dp), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        item {
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Stat(w("دانلود", "Download"), bytes(tunnel.download), Modifier.weight(1f), Mint)
                                Stat(w("آپلود", "Upload"), bytes(tunnel.upload), Modifier.weight(1f), Violet)
                                Stat(w("پینگ", "Latency"), tunnel.latency?.let { "$it ms" } ?: "—", Modifier.weight(1f), Color(0xFFF6BE69))
                            }
                        }
                        if (tunnel.status == "connected") item {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(w("مدت اتصال", "Session") + " · " + elapsed((now - tunnel.startedAt).coerceAtLeast(0)), style = MaterialTheme.typography.bodySmall)
                                if (tunnel.deadline > 0) Text(w("باقی‌مانده", "Remaining") + " · " + elapsed((tunnel.deadline - now).coerceAtLeast(0)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                        item {
                            Panel {
                                Text(w("پروفایل فعال", "Active profile"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                val selected = data.profiles.find { it.id == data.selectedId }
                                if (selected == null) {
                                    Text(w("هنوز پروفایلی نداری.", "Your first connection starts here."), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    OutlinedButton(onClick = { importing = true }, enabled = !locked, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Add, null); Text(w("افزودن پروفایل", "Add profile")) }
                                } else {
                                    Text(selected.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                                    Text(selected.server, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        AssistChip(onClick = { page = "profiles" }, label = { Text(selected.protocol.uppercase()) })
                                        TextButton(onClick = { page = "profiles" }, enabled = !locked) { Text(w("تغییر پروفایل", "Change profile")) }
                                    }
                                }
                            }
                        }
                        item { RoutingCard(data, locked, w, onMode = { mode -> save { it.copy(mode = mode) } }, onApps = { page = "apps" }) }
                        if (tunnel.error.isNotEmpty()) item {
                            Panel {
                                Text(w("جزئیات خطای اتصال", "Connection diagnostics"), color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                                SelectionText(tunnel.error)
                                TextButton(onClick = { context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Azadi diagnostics", tunnel.error)); tell(w("جزئیات کپی شد.", "Diagnostics copied.")) }) { Text(w("کپی جزئیات", "Copy diagnostics")) }
                            }
                        }
                        item { Text(w("برای ایران ❤️ · For Iran", "For Iran ❤️ · برای ایران"), Modifier.fillMaxWidth().padding(6.dp), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    "profiles" -> LazyColumn(Modifier.padding(inset).fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        item { ScreenTitle(w("اتصال‌های من", "Your connections"), w("پروفایل‌ها فقط روی دستگاه رمزگذاری می‌شوند.", "Encrypted on this device. Yours to control.")) }
                        item { Button(onClick = { importing = true }, enabled = !locked, modifier = Modifier.fillMaxWidth().height(50.dp)) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text(w("افزودن پروفایل", "Add a profile")) } }
                        if (data.profiles.isEmpty()) item { EmptyCard(w("از یک لینک شروع کن.", "Start with a link."), w("WireGuard، VLESS، VMess، Shadowsocks، Trojan، Hysteria2، TUIC، OpenVPN و پراکسی.", "WireGuard, VLESS, VMess, Shadowsocks, Trojan, Hysteria2, TUIC, OpenVPN and proxies.")) }
                        items(data.profiles, key = { it.id }) { p ->
                            Panel {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(Modifier.size(42.dp).background(MaterialTheme.colorScheme.primary.copy(alpha = .12f), RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Default.CheckCircle, null, tint = if (data.selectedId == p.id) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(p.name, fontWeight = FontWeight.Bold); Text(p.server, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    IconButton(onClick = { remove = p }, enabled = !locked) { Icon(Icons.Default.Delete, w("حذف", "Delete"), tint = MaterialTheme.colorScheme.error) }
                                }
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(p.protocol.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                                    TextButton(enabled = !locked && data.selectedId != p.id, onClick = { save { it.copy(selectedId = p.id) } }) { Text(if (data.selectedId == p.id) w("انتخاب‌شده", "Selected") else w("انتخاب", "Select")) }
                                }
                            }
                        }
                    }
                    "apps" -> AppsPage(data, locked, w, Modifier.padding(inset), onToggle = { id -> save { it.copy(apps = if (id in it.apps) it.apps - id else it.apps + id) } })
                    else -> LazyColumn(Modifier.padding(inset).fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        item { ScreenTitle(w("به سبک خودت", "Make it yours."), w("کنترل‌های کوچک، آرامش بیشتر.", "Thoughtful controls for everyday connections.")) }
                        item { Panel {
                            Setting(w("حالت تاریک", "Dark appearance"), w("همان رنگ‌ها، متناسب با تو.", "A familiar palette, day or night.")) { Switch(checked = data.dark, onCheckedChange = { value -> save { it.copy(dark = value) } }) }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .3f))
                            Setting(w("زبان و جهت", "Language & direction"), w("فارسی / انگلیسی", "Persian / English")) { TextButton(onClick = { save { it.copy(language = if (w.fa) "en" else "fa") } }) { Text(if (w.fa) "English" else "فارسی") } }
                        } }
                        item { Panel {
                            Text(w("قطع اتصال زمان‌دار", "Session timer"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(w("بعد از اتصال فعال کن. اندروید ممکن است زمان را در حالت صرفه‌جویی باتری کمی به تأخیر بیندازد.", "Set after connecting. Android battery saving can delay the deadline."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { listOf(15, 30, 60, 120).forEach { minutes -> OutlinedButton(enabled = tunnel.status == "connected", onClick = { context.startService(Intent(context, AzadiVpnService::class.java).setAction(AzadiVpnService.TIMER).putExtra("minutes", minutes)); tell(w("تایمر تنظیم شد.", "Timer updated.")) }, contentPadding = PaddingValues(horizontal = 10.dp)) { Text("$minutes " + w("د", "m"), style = MaterialTheme.typography.labelSmall) } } }
                            if (tunnel.deadline > 0) { Text(w("باقی‌مانده: ", "Remaining: ") + elapsed((tunnel.deadline - now).coerceAtLeast(0)), color = MaterialTheme.colorScheme.primary); TextButton(onClick = { context.startService(Intent(context, AzadiVpnService::class.java).setAction(AzadiVpnService.TIMER).putExtra("minutes", 0)) }) { Text(w("لغو تایمر", "Cancel timer")) } }
                        } }
                        item { Panel {
                            Text(w("قفل شبکهٔ اندروید", "Android network protection"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(w("برای جلوگیری از اتصال مستقیم، در تنظیمات VPN اندروید «VPN همیشه روشن» و «مسدودکردن اتصال بدون VPN» را فعال کن. تایمر این قفل را آزاد نمی‌کند.", "For persistent protection, enable Always-on VPN and Block connections without VPN in Android VPN settings. The timer does not release this system lock."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 10.dp))
                            OutlinedButton(onClick = { context.startActivity(Intent(Settings.ACTION_VPN_SETTINGS)) }) { Text(w("تنظیمات VPN اندروید", "Open Android VPN settings")) }
                        } }
                        item { Panel {
                            Text(w("مرکز به‌روزرسانی", "Update center"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(updateText(update, w), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 10.dp))
                            if (update.status == "downloading") LinearProgressIndicator(progress = { update.progress / 100f }, modifier = Modifier.fillMaxWidth())
                            Button(enabled = update.status !in listOf("checking", "downloading"), onClick = {
                                scope.launch {
                                    try {
                                        when (update.status) {
                                            "available" -> updater.download()
                                            "ready" -> {
                                                if (!context.packageManager.canRequestPackageInstalls()) {
                                                    context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, ("package:" + context.packageName).toUri()))
                                                    tell(w("مجوز نصب را بده و دوباره نصب را بزن.", "Allow app installation, then tap Install again."))
                                                } else context.startActivity(updater.installer())
                                            }
                                            else -> updater.check()
                                        }
                                    } catch (_: Exception) { tell(w("آپدیت تأیید نشد؛ اینترنت، فایل و امضای برنامه را بررسی کن.", "Update could not be verified. Check the network, release assets and APK signer.")) }
                                }
                            }) { Text(when (update.status) { "available" -> w("دریافت آپدیت", "Download update"); "ready" -> w("نصب آپدیت", "Install update"); else -> w("بررسی نسخه", "Check for updates") }) }
                        } }
                        item { Panel {
                            Text("Azadi Connect · ${BuildConfig.VERSION_NAME}", fontWeight = FontWeight.Bold)
                            Text(w("پروفایل‌ها با کلید Android Keystore رمزگذاری می‌شوند. کانفیگ‌ها به گیت‌هاب ارسال نمی‌شوند.", "Profiles are encrypted with Android Keystore. Configurations are never uploaded to GitHub."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 10.dp))
                            Text("sing-box 1.14.3 · GPL-3.0-or-later", style = MaterialTheme.typography.labelSmall)
                            TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, "https://github.com/Mr-Saman/azadi-connect".toUri())) }) { Text(w("⭐ حمایت با استار در GitHub", "⭐ Support the project on GitHub")) }
                        } }
                    }
                }
            }
            if (importing) ImportSheet(w, importingBusy, onDismiss = { if (!importingBusy) importing = false }, onFile = { user, pass -> importing = false; onFile(user, pass) }, onImport = { raw, user, pass ->
                if (!importingBusy) { importingBusy = true; scope.launch {
                    try { withContext(Dispatchers.IO) { vault.import(Profiles.import(raw, username = user, password = pass)) }; importing = false; tell(w("پروفایل‌ها اضافه شدند.", "Profiles imported.")) }
                    catch (_: Exception) { tell(w("پروفایل نامعتبر است یا گزینهٔ پشتیبانی‌نشده دارد.", "Invalid profile or unsupported options.")) }
                    finally { importingBusy = false }
                } }
            })
            remove?.let { p -> AlertDialog(onDismissRequest = { remove = null }, title = { Text(w("حذف پروفایل؟", "Remove profile?")) }, text = { Text(p.name) }, confirmButton = { TextButton(onClick = { save { old -> val remaining = old.profiles.filter { it.id != p.id }; old.copy(profiles = remaining, selectedId = if (old.selectedId == p.id) remaining.firstOrNull()?.id.orEmpty() else old.selectedId) }; remove = null }) { Text(w("حذف", "Remove")) } }, dismissButton = { TextButton(onClick = { remove = null }) { Text(w("انصراف", "Cancel")) } }) }
        }
    }
}
@Composable private fun Panel(content: @Composable ColumnScope.() -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(24.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .32f)), modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(5.dp), content = content) }
}
@Composable private fun ScreenTitle(title: String, sub: String) { Column(Modifier.padding(bottom = 4.dp)) { Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp)) } }
@Composable private fun StatusPill(status: String, w: Words) {
    val color = when (status) { "connected" -> MaterialTheme.colorScheme.primary; "connecting" -> MaterialTheme.colorScheme.secondary; "error" -> MaterialTheme.colorScheme.error; else -> MaterialTheme.colorScheme.onSurfaceVariant }
    Surface(color = color.copy(alpha = .12f), shape = CircleShape) { Text(when (status) { "connected" -> w("تأییدشده", "VERIFIED"); "connecting" -> w("در حال بررسی", "VERIFYING"); "error" -> w("خطا", "ERROR"); else -> w("آماده", "READY") }, Modifier.padding(horizontal = 10.dp, vertical = 5.dp), color = color, style = MaterialTheme.typography.labelSmall) }
}
private fun statusTitle(status: String, w: Words) = when (status) { "connected" -> w("متصل، با خیال راحت.", "You're connected."); "connecting" -> w("در مسیر آزادی…", "Finding your flow…"); "error" -> w("اتصال تأیید نشد.", "Let's try that again."); else -> w("یک لمس تا اتصال.", "Ready when you are.") }
@Composable private fun Orbit(status: String, w: Words, onClick: () -> Unit) {
    val active = status == "connected"; val color = if (status == "connecting") MaterialTheme.colorScheme.secondary else if (status == "error") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    val phase = if (active || status == "connecting") {
        val transition = rememberInfiniteTransition(label = "orbit")
        val angle by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(14000, easing = LinearEasing)), label = "orbit angle")
        angle
    } else 0f
    Box(Modifier.fillMaxWidth().height(215.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(208.dp)) {
            drawCircle(Brush.radialGradient(listOf(color.copy(alpha = if (active) .17f else .08f), Color.Transparent)))
            drawCircle(color.copy(alpha = .12f), radius = size.minDimension * .48f, style = Stroke(1.dp.toPx()))
            drawCircle(color.copy(alpha = .22f), radius = size.minDimension * .37f, style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 12f), if (active || status == "connecting") phase else 0f)))
            drawArc(color.copy(alpha = .5f), startAngle = if (active || status == "connecting") phase else -40f, sweepAngle = 65f, useCenter = false, topLeft = Offset(size.width * .13f, size.height * .13f), size = androidx.compose.ui.geometry.Size(size.width * .74f, size.height * .74f), style = Stroke(2.dp.toPx()))
        }
        Surface(onClick = onClick, shape = CircleShape, color = color.copy(alpha = .12f), border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = .45f)), modifier = Modifier.size(98.dp).semantics { contentDescription = if (active || status == "connecting") w("قطع اتصال", "Disconnect") else w("اتصال", "Connect") }) {
            Canvas(Modifier.fillMaxSize().padding(29.dp)) { drawArc(color, -45f, 270f, false, style = Stroke(3.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round)); drawLine(color, Offset(size.width / 2, -3.dp.toPx()), Offset(size.width / 2, size.height * .45f), 3.dp.toPx(), androidx.compose.ui.graphics.StrokeCap.Round) }
        }
    }
}
@Composable private fun Stat(label: String, value: String, modifier: Modifier, color: Color) {
    Surface(modifier, shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface) { Column(Modifier.padding(horizontal = 10.dp, vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) { Box(Modifier.size(5.dp).background(color, CircleShape)); Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp), maxLines = 1); Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
}
@Composable private fun RoutingCard(data: AppData, locked: Boolean, w: Words, onMode: (String) -> Unit, onApps: () -> Unit) {
    Panel {
        Text(w("مسیر ترافیک", "Choose your route"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        listOf("system" to w("تمام دستگاه", "Entire device"), "apps" to w("برنامه‌های انتخابی", "Selected applications")).forEach { (mode, label) ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable(enabled = !locked) { onMode(mode) }.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) { RadioButton(selected = data.mode == mode, onClick = { onMode(mode) }, enabled = !locked); Text(label, style = MaterialTheme.typography.bodyMedium) }
        }
        if (data.mode == "apps") TextButton(onClick = onApps) { Text(w("انتخاب برنامه‌ها", "Choose applications") + " · ${data.apps.size}") }
        Text(w("فقط ترافیک گرفته‌شده به VPN می‌رود؛ سرور و محدودهٔ AllowedIPs پروفایل تعیین‌کننده‌اند.", "Captured traffic uses the VPN. Server support and profile AllowedIPs still apply."), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable private fun Setting(title: String, detail: String, control: @Composable () -> Unit) { Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold); Text(detail, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }; control() } }
@Composable private fun EmptyCard(title: String, sub: String) { Panel { Icon(Icons.Default.Info, null, tint = MaterialTheme.colorScheme.primary); Text(title, fontWeight = FontWeight.Bold); Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
@Composable private fun SelectionText(text: String) { androidx.compose.foundation.text.selection.SelectionContainer { Text(text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 8.dp)) } }
@Composable private fun AppsPage(data: AppData, locked: Boolean, w: Words, modifier: Modifier, onToggle: (String) -> Unit) {
    val context = LocalContext.current
    var query by rememberSaveable { mutableStateOf("") }
    var apps by remember { mutableStateOf<List<InstalledApp>?>(null) }
    LaunchedEffect(Unit) {
        apps = withContext(Dispatchers.IO) {
            context.packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0).map { InstalledApp(it.activityInfo.packageName, it.loadLabel(context.packageManager).toString()) }.distinctBy { it.id }.filter { it.id != context.packageName }.sortedBy { it.label.lowercase() }
        }
    }
    val filtered = apps?.filter { it.label.contains(query, true) || it.id.contains(query, true) }.orEmpty()
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { ScreenTitle(w("مسیر هر برنامه، دست تو.", "Every app. Your choice."), w("برنامه‌های منتخب از تونل استفاده می‌کنند؛ بقیه مسیر عادی دارند.", "Selected apps use the tunnel. Others keep their normal route.")) }
        item { OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text(w("جست‌وجوی برنامه…", "Search applications…")) }, leadingIcon = { Icon(Icons.Default.Search, null) }, shape = RoundedCornerShape(18.dp)) }
        item { Text(w("انتخاب‌شده", "Selected") + " · ${data.apps.size}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium) }
        if (apps == null) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        if (apps != null && filtered.isEmpty()) item { EmptyCard(w("برنامه‌ای پیدا نشد.", "No matching applications."), w("نام دیگری را امتحان کن.", "Try another app name.")) }
        items(filtered, key = { it.id }) { app ->
            Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().clickable(enabled = !locked) { onToggle(app.id) }) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    ApplicationIcon(app)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(app.label, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold); Text(app.id, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Checkbox(checked = app.id in data.apps, onCheckedChange = { onToggle(app.id) }, enabled = !locked)
                }
            }
        }
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ImportSheet(w: Words, busy: Boolean, onDismiss: () -> Unit, onFile: (String, String) -> Unit, onImport: (String, String, String) -> Unit) {
    var raw by remember { mutableStateOf("") }; var user by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(w("یک راه تازه برای اتصال", "A new way forward."), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(w("لینک یا فایل را از ارائه‌دهندهٔ خودت بگیر.", "Bring a profile or share links from your provider."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(raw, { if (it.length <= Profiles.MAX_BYTES) raw = it }, Modifier.fillMaxWidth().heightIn(min = 110.dp, max = 170.dp), label = { Text(w("لینک یا متن پیکربندی", "Share link or configuration")) }, shape = RoundedCornerShape(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(user, { user = it }, Modifier.weight(1f), label = { Text(w("نام کاربری OpenVPN", "OpenVPN username")) }, singleLine = true)
                OutlinedTextField(password, { password = it }, Modifier.weight(1f), label = { Text(w("رمز OpenVPN", "OpenVPN password")) }, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false), singleLine = true)
            }
            Button(onClick = { onImport(raw, user, password) }, enabled = raw.isNotBlank() && !busy, modifier = Modifier.fillMaxWidth()) { Text(w("افزودن پروفایل", "Import profiles")) }
            OutlinedButton(onClick = { onFile(user, password) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(w("انتخاب فایل از دستگاه", "Choose a file")) }
            Text(w("کلیدها روی دستگاه رمزگذاری می‌شوند و آپلود نمی‌شوند.", "Keys are encrypted on this device and never uploaded."), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 26.dp))
        }
    }
}
private fun bytes(value: Long): String { if (value < 1024) return "$value B"; val i = (kotlin.math.ln(value.toDouble()) / kotlin.math.ln(1024.0)).toInt().coerceIn(1, 3); return String.format(Locale.US, "%.1f %s", value / Math.pow(1024.0, i.toDouble()), listOf("B", "KB", "MB", "GB")[i]) }
private fun elapsed(ms: Long): String { val s = ms / 1000; return String.format(Locale.US, "%02d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) }
private fun updateText(s: UpdateState, w: Words) = when (s.status) {
    "checking" -> w("در حال بررسی نسخه…", "Checking for updates…")
    "current" -> w("آخرین نسخه نصب است.", "You're up to date.")
    "available" -> w("نسخهٔ جدید موجود است: ", "New release available: ") + s.version
    "unavailable" -> w("این Release هنوز فایل اندروید ندارد.", "This release has no Android APK yet.")
    "downloading" -> w("در حال دریافت: ", "Downloading: ") + s.progress + "%"
    "ready" -> w("فایل و امضای برنامه تأیید شدند.", "APK checksum and signer verified.")
    "error" -> w("دریافت یا تأیید آپدیت انجام نشد.", "Could not retrieve or verify the update.")
    else -> w("فقط APK رسمی با امضای همسان قابل نصب است.", "Only official APKs signed by the same publisher can be installed.")
}

@Composable private fun ApplicationIcon(app: InstalledApp) {
    val context = LocalContext.current
    val image by produceState<ImageBitmap?>(null, app.id) {
        value = withContext(Dispatchers.IO) { runCatching { context.packageManager.getApplicationIcon(app.id).toBitmap(80, 80).asImageBitmap() }.getOrNull() }
    }
    Box(Modifier.size(40.dp).background(MaterialTheme.colorScheme.secondary.copy(alpha = .12f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
        image?.let { Image(it, contentDescription = null, modifier = Modifier.size(34.dp).clip(RoundedCornerShape(8.dp))) }
            ?: Text(app.label.take(1).uppercase(), color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.Bold)
    }
}
