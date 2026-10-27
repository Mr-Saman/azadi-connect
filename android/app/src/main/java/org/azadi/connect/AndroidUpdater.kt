package org.azadi.connect

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

data class UpdateState(val status: String = "idle", val version: String = "", val progress: Int = 0)
object UpdateRules {
    fun version(s: String): List<Int> { require(s.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))); return s.split('.').map { it.toInt() } }
    fun newer(a: String, b: String): Boolean { val x = version(a); val y = version(b); for (i in x.indices) if (x[i] != y[i]) return x[i] > y[i]; return false }
    fun checksum(text: String, name: String): String {
        val matches = text.lines().mapNotNull { Regex("^([a-fA-F0-9]{64})\\s+\\*?(.+)$").matchEntire(it) }.filter { it.groupValues[2] == name }
        require(matches.size == 1) { "Invalid update checksum" }; return matches.single().groupValues[1].lowercase()
    }
}
class AndroidUpdater(private val context: Context) {
    val state = MutableStateFlow(UpdateState())
    private var release: JSONObject? = null
    private var file: File? = null
    private var expected = ""
    private val busy = java.util.concurrent.atomic.AtomicBoolean(false)
    private fun response(url: String): HttpURLConnection {
        require(url.startsWith("https://")); val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 30000; c.setRequestProperty("Accept", "application/vnd.github+json")
        if (c.responseCode != 200) { c.disconnect(); error("Update request failed") }; return c
    }
    private fun read(url: String, limit: Int): String {
        val c = response(url)
        return try { val bytes = c.inputStream.use { input -> val output = java.io.ByteArrayOutputStream(); val b = ByteArray(8192); while (true) { val n = input.read(b); if (n < 0) break; require(output.size() + n <= limit); output.write(b, 0, n) }; output.toByteArray() }; require(bytes.size <= limit); String(bytes, Charsets.UTF_8) } finally { c.disconnect() }
    }
    suspend fun check() = withContext(Dispatchers.IO) {
        if (!busy.compareAndSet(false, true)) return@withContext
        state.value = UpdateState("checking")
        try {
            val r = JSONObject(read("https://api.github.com/repos/Mr-Saman/azadi-connect/releases/latest", 2 * 1024 * 1024))
            check(!r.optBoolean("draft") && !r.optBoolean("prerelease"))
            val version = r.getString("tag_name").removePrefix("v")
            if (!UpdateRules.newer(version, BuildConfig.VERSION_NAME)) { state.value = UpdateState("current"); return@withContext }
            release = r
            val asset = assets(r).find { it.getString("name") == "Azadi-Connect-$version-Android.apk" }
            state.value = UpdateState(if (asset == null) "unavailable" else "available", version)
        } catch (e: Exception) { state.value = UpdateState("error"); throw e } finally { busy.set(false) }
    }
    private fun assets(r: JSONObject) = r.getJSONArray("assets").let { a -> (0 until a.length()).map { a.getJSONObject(it) } }
    suspend fun download() = withContext(Dispatchers.IO) {
        if (!busy.compareAndSet(false, true)) return@withContext
        val folder = File(context.cacheDir, "updates").apply { mkdirs() }; val partial = File(folder, "update.partial")
        try {
            val r = requireNotNull(release); val version = r.getString("tag_name").removePrefix("v"); UpdateRules.version(version)
            val name = "Azadi-Connect-$version-Android.apk"; val list = assets(r); val a = list.single { it.getString("name") == name }; val sums = list.single { it.getString("name") == "SHA256SUMS.txt" }
            val prefix = "https://github.com/Mr-Saman/azadi-connect/releases/download/v$version/"
            require(a.getString("browser_download_url") == prefix + name && sums.getString("browser_download_url") == prefix + "SHA256SUMS.txt")
            val size = a.getLong("size"); require(size in 1..(300L * 1024 * 1024))
            expected = UpdateRules.checksum(read(prefix + "SHA256SUMS.txt", 65536), name)
            state.value = UpdateState("downloading", version)
            val c = response(prefix + name)
            try {
                val hash = MessageDigest.getInstance("SHA-256"); var count = 0L
                c.inputStream.use { input -> partial.outputStream().use { output ->
                    val buffer = ByteArray(65536)
                    while (true) { val n = input.read(buffer); if (n < 0) break; count += n; require(count <= size); output.write(buffer, 0, n); hash.update(buffer, 0, n); state.value = state.value.copy(progress = (count * 100 / size).toInt()) }
                } }
                check(count == size && hash.digest().hex() == expected) { "Update integrity failed" }
            } finally { c.disconnect() }
            verifyPackage(partial)
            val target = File(folder, name); check(partial.renameTo(target)); file = target
            state.value = UpdateState("ready", version, 100)
        } catch (e: Exception) { state.value = UpdateState("error"); throw e } finally { partial.delete(); busy.set(false) }
    }
    @Suppress("DEPRECATION")
    private fun verifyPackage(apk: File) {
        val pm = context.packageManager; val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val candidate = pm.getPackageArchiveInfo(apk.path, flags) ?: error("Invalid APK")
        val installed = pm.getPackageInfo(context.packageName, flags)
        check(candidate.packageName == context.packageName && candidate.versionName == state.value.version) { "Wrong update package" }
        val newCode = if (Build.VERSION.SDK_INT >= 28) candidate.longVersionCode else candidate.versionCode.toLong()
        val oldCode = if (Build.VERSION.SDK_INT >= 28) installed.longVersionCode else installed.versionCode.toLong()
        check(newCode > oldCode) { "Update version is not newer" }
        fun signatures(info: android.content.pm.PackageInfo): Set<String> {
            val sigs = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
            return sigs?.map { MessageDigest.getInstance("SHA-256").digest(it.toByteArray()).hex() }?.toSet().orEmpty()
        }
        val current = signatures(installed); check(current.isNotEmpty() && signatures(candidate) == current) { "APK signer does not match installed app" }
    }
    suspend fun installer(): Intent = withContext(Dispatchers.IO) {
        check(state.value.status == "ready")
        val apk = requireNotNull(file)
        check(apk.inputStream().use { MessageDigest.getInstance("SHA-256").apply { val b = ByteArray(65536); while (true) { val n = it.read(b); if (n < 0) break; update(b, 0, n) } }.digest().hex() } == expected) { "Update integrity failed" }
        verifyPackage(apk)
        Intent(Intent.ACTION_VIEW).setDataAndType(FileProvider.getUriForFile(context, context.packageName + ".files", apk), "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
}
private fun ByteArray.hex() = joinToString("") { "%02x".format(it) }
