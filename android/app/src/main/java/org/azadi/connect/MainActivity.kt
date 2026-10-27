package org.azadi.connect

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private val messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    private var credentials = "" to ""
    private val vault get() = (application as AzadiApplication).vault
    private fun message(fa: String, en: String) { messages.tryEmit(if (vault.data.value.language == "fa") fa else en) }
    private val vpnPermission = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK) startVpn() else message("مجوز اتصال VPN داده نشد.", "VPN permission was not granted.")
    }
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { prepareVpn() }
    private val picker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val saved = credentials; credentials = "" to ""
        if (uri != null) lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val name = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else "" }.orEmpty()
                    val bytes = contentResolver.openInputStream(uri)?.use { input ->
                        val output = java.io.ByteArrayOutputStream(); val b = ByteArray(8192)
                        while (true) { val n = input.read(b); if (n < 0) break; require(output.size() + n <= Profiles.MAX_BYTES); output.write(b, 0, n) }; output.toByteArray()
                    } ?: error("Unreadable file")
                    vault.import(Profiles.import(String(bytes, Charsets.UTF_8), name, saved.first, saved.second))
                }
                message("پروفایل‌ها اضافه شدند.", "Profiles imported.")
            } catch (_: Exception) { message("ورود پروفایل انجام نشد؛ قالب، حجم فایل و اطلاعات ورود را بررسی کن.", "Import failed. Check the format, file size and credentials.") }
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if ((application as AzadiApplication).startupError) {
            AlertDialog.Builder(this).setTitle("Azadi Connect").setMessage("The encrypted vault could not be opened. Existing data was preserved.\nگاوصندوق رمزگذاری‌شده باز نشد؛ اطلاعات قبلی حفظ شده است.").setPositiveButton("Close") { _, _ -> finish() }.setCancelable(false).show(); return
        }
        enableEdgeToEdge()
        setContent { AzadiApp(vault, messages, onConnect = {
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            else prepareVpn()
        }, onFile = { user, pass -> credentials = user to pass; picker.launch(arrayOf("*/*")) }) }
    }
    private fun prepareVpn() { val intent = VpnService.prepare(this); if (intent != null) vpnPermission.launch(intent) else startVpn() }
    private fun startVpn() {
        try { ContextCompat.startForegroundService(this, Intent(this, AzadiVpnService::class.java)) }
        catch (_: Exception) { message("راه‌اندازی VPN انجام نشد؛ مجوزها را بررسی کن.", "VPN could not start. Check system permissions.") }
    }
}
