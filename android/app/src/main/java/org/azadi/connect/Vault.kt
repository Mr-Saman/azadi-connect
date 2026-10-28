package org.azadi.connect

import android.app.Application
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class AppData(val profiles: List<Profile> = emptyList(), val selectedId: String = "", val apps: Set<String> = emptySet(), val mode: String = "system", val language: String = "fa", val dark: Boolean = true) {
    fun json() = obj("profiles" to arr(profiles.map { it.json() }), "selectedId" to selectedId, "apps" to arr(apps), "mode" to mode, "language" to language, "dark" to dark)
    companion object {
        fun from(j: JSONObject): AppData {
            val profiles = j.getJSONArray("profiles").let { a -> (0 until a.length()).map { Profile.from(a.getJSONObject(it)) } }
            return AppData(profiles, j.optString("selectedId"), j.optJSONArray("apps")?.strings()?.toSet().orEmpty(), j.optString("mode", "system"), j.optString("language", "fa"), j.optBoolean("dark", true))
        }
    }
}
class Vault(context: Context) {
    private val file = AtomicFile(File(context.filesDir, "profiles.aes"))
    private val mutable = MutableStateFlow(load())
    val data: StateFlow<AppData> = mutable
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("azadi-vault-v1", null) as? SecretKey)?.let { return it }
        check(!file.baseFile.exists()) { "Vault key is unavailable" }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("azadi-vault-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    private fun load(): AppData {
        if (!file.baseFile.exists()) return AppData()
        check(file.baseFile.length() <= 16 * 1024 * 1024 + 64) { "Vault is too large" }
        val bytes = file.readFully(); check(bytes.size >= 29 && bytes[0] == 1.toByte()) { "Invalid vault" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
        return AppData.from(JSONObject(String(cipher.doFinal(bytes.copyOfRange(13, bytes.size)), Charsets.UTF_8)))
    }
    @Synchronized fun update(change: (AppData) -> AppData) {
        val old = mutable.value
        val next = change(old)
        if (Tunnel.state.value.status in listOf("connecting", "connected")) check(next.profiles == old.profiles && next.selectedId == old.selectedId && next.apps == old.apps && next.mode == old.mode) { "Disconnect first" }
        require(next.profiles.size <= 500 && next.mode in listOf("system", "apps") && next.language in listOf("fa", "en"))
        val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key())
        val plaintext = next.json().toString().toByteArray(Charsets.UTF_8)
        require(plaintext.size <= 16 * 1024 * 1024) { "Vault limit reached" }
        val bytes = byteArrayOf(1) + cipher.iv + cipher.doFinal(plaintext)
        val stream = file.startWrite()
        try { stream.write(bytes); file.finishWrite(stream) } catch (e: Exception) { file.failWrite(stream); throw e }
        mutable.value = next
    }
    @Synchronized fun connectionSnapshot(markConnecting: (AppData) -> Unit): AppData {
        val current = mutable.value
        markConnecting(current)
        return current
    }
    fun import(profiles: List<Profile>) = update { current ->
        check(Tunnel.state.value.status !in listOf("connecting", "connected")) { "Disconnect first" }
        current.copy(profiles = current.profiles + profiles, selectedId = current.selectedId.ifEmpty { profiles.first().id })
    }
}
class AzadiApplication : Application() {
    lateinit var vault: Vault
    var startupError = false
    override fun onCreate() {
        super.onCreate()
        try { vault = Vault(this) } catch (_: Exception) { startupError = true }
    }
}
data class TunnelState(val status: String = "disconnected", val profileName: String = "", val startedAt: Long = 0, val deadline: Long = 0, val upload: Long = 0, val download: Long = 0, val latency: Long? = null, val error: String = "")
object Tunnel { val owner = java.util.concurrent.atomic.AtomicReference(""); val state = MutableStateFlow(TunnelState()) }
