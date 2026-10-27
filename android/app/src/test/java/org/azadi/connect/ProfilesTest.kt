package org.azadi.connect
import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.util.Base64

class ProfilesTest {
    private val id = "bf000d23-0752-40b4-affe-68f7707a9661"
    private val key = Base64.getEncoder().encodeToString(ByteArray(32) { 1 })
    private fun rejects(block: () -> Unit) { try { block(); fail("Expected rejection") } catch (_: IllegalArgumentException) {} catch (_: IllegalStateException) {} }
    private fun wg(extra: String = "") = "[Interface]\nPrivateKey=$key\nAddress=10.1.1.2/32,fd00::2/128\nDNS=1.1.1.1\n$extra\n[Peer]\nPublicKey=$key\nEndpoint=[2001:db8::1]:51820\nAllowedIPs=10.0.0.0/8,::/0\nPersistentKeepalive=25"
    @Test fun wireguardPreservesAllowedIPsAndIPv6() {
        val p = Profiles.import(wg()).single(); val e = JSONObject(p.endpoint)
        assertEquals("2001:db8::1", e.getJSONArray("peers").getJSONObject(0).getString("address"))
        assertEquals("10.0.0.0/8", e.getJSONArray("peers").getJSONObject(0).getJSONArray("allowed_ips").getString(0))
        assertEquals(listOf("1.1.1.1"), p.dns)
        assertEquals("fd00::2/128", e.getJSONArray("address").getString(1))
    }
    @Test fun wireguardRejectsExecutableHooksAndDuplicates() {
        rejects { Profiles.import(wg("PostUp=evil")) }
        rejects { Profiles.import(wg("PrivateKey=$key")) }
        rejects { Profiles.import(wg().replace(key, "invalid")) }
    }
    @Test fun prefixValidationRejectsInvalidAddresses() {
        listOf("300.1.1.1/24", "1.1.1.1/33", "::1/129", "host.invalid/24", "1.1.1.1").forEach { rejects { Profiles.cidr(it) } }
    }
    @Test fun realityAndTransportRemainIntact() {
        val e = JSONObject(Profiles.import("vless://$id@example.com:443?security=reality&pbk=test-key&sid=abcd&type=ws&path=%2Fvpn#%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C").single().endpoint)
        assertEquals("/vpn", e.getJSONObject("transport").getString("path"))
        assertEquals("test-key", e.getJSONObject("tls").getJSONObject("reality").getString("public_key"))
    }
    @Test fun insecureAndUnknownOptionsAreRejected() {
        for (query in listOf("allowInsecure=1", "insecure=true", "type=xhttp", "security=reality", "type=ws&type=grpc", "random=1", "encryption=aes")) rejects { Profiles.import("vless://$id@example.com:443?$query") }
    }
    @Test fun mandatoryTlsCannotBeDisabled() {
        rejects { Profiles.import("trojan://password@example.com:443?security=none") }
        val e = JSONObject(Profiles.import("https://example.com").single().endpoint)
        assertTrue(e.getJSONObject("tls").getBoolean("enabled"))
        assertEquals(443, e.getInt("server_port"))
    }
    @Test fun modernVmessImportsAndLegacyFails() {
        fun link(aid: String) = "vmess://" + Base64.getEncoder().encodeToString(obj("add" to "example.com", "port" to 443, "id" to id, "aid" to aid, "net" to "tcp", "tls" to "tls").toString().toByteArray())
        assertEquals("vmess", Profiles.import(link("0")).single().protocol)
        rejects { Profiles.import(link("64")) }; rejects { Profiles.import(link("bad")) }
    }
    @Test fun shadowsocksSupportsSip002AndFullBase64() {
        val auth = Base64.getEncoder().encodeToString("aes-256-gcm:password".toByteArray())
        val p = Profiles.import("ss://$auth@example.com:8388").single()
        assertEquals("password", JSONObject(p.endpoint).getString("password"))
        assertEquals("shadowsocks", Profiles.import("ss://" + Base64.getEncoder().encodeToString("aes-256-gcm:password@example.com:8388".toByteArray())).single().protocol)
        rejects { Profiles.import("ss://$auth@example.com:8388?plugin=evil") }
    }
    @Test fun otherShareProtocolsImport() {
        listOf("trojan://pw@example.com:443", "hy2://pw@example.com:443", "tuic://$id:pw@example.com:443", "socks5://user:pass@example.com:1080", "http://example.com:80").forEach { assertEquals(1, Profiles.import(it).size) }
    }
    @Test fun offlineBatchAndLimits() {
        val raw = "socks5://example.com:1080\nhttps://example.org:443"
        assertEquals(2, Profiles.import(Base64.getEncoder().encodeToString(raw.toByteArray())).size)
        rejects { Profiles.import(List(201) { "socks5://example.com" }.joinToString("\n")) }
        rejects { Profiles.import("x".repeat(Profiles.MAX_BYTES + 1)) }
        rejects { Profiles.import("{\"outbounds\":[]}") }
    }
    private fun ovpn(extra: String = ""): String {
        val ca = javaClass.getResource("/ca.txt")!!.readText()
        return "client\ndev tun\nproto udp\nremote example.com 1194\n$extra\n<ca>\n$ca\n</ca>"
    }
    @Test fun openvpnRequiresInlineTrustAndSafeOptions() {
        val p = Profiles.import(ovpn()).single()
        assertEquals("openvpn-client", p.protocol); assertTrue(JSONObject(p.endpoint).getBoolean("route_no_pull"))
        for (extra in listOf("up evil", "plugin evil", "ca external.pem", "auth-user-pass credentials.txt", "tls-version-min 1.0", "dev tap")) rejects { Profiles.import(ovpn(extra)) }
    }
    @Test fun openvpnCredentialsAreExplicit() {
        rejects { Profiles.import(ovpn("auth-user-pass")) }
        val p = Profiles.import(ovpn("auth-user-pass"), username = "user", password = "test-password").single()
        assertEquals("test-password", JSONObject(p.endpoint).getString("password"))
    }
    @Test fun generatedConfigHasNoDirectFallbackAndNoWindowsPaths() {
        val p = Profiles.import("socks5://example.com:1080").single()
        val c = JSONObject(Config.build(p, 12345, "x".repeat(64)))
        assertEquals("vpn", c.getJSONObject("route").getString("final"))
        assertFalse(c.toString().contains("process_path"))
        assertEquals("secure-dns", c.getJSONObject("dns").getString("final"))
        assertEquals("127.0.0.1:12345", c.getJSONObject("experimental").getJSONObject("clash_api").getString("external_controller"))
    }
    @Test fun endpointProtocolsAreNotAddedAsOutbounds() {
        val c = JSONObject(Config.build(Profiles.import(wg()).single(), 12345, "x".repeat(64)))
        assertEquals("wireguard", c.getJSONArray("endpoints").getJSONObject(0).getString("type"))
        assertEquals(1, c.getJSONArray("outbounds").length())
    }
    @Test fun diagnosticSecretsAreRedacted() {
        val p = Profiles.import("socks5://user:secret-password@example.com").single()
        val safe = Diagnostics.safe("user secret-password", p)
        assertFalse(safe.contains("secret-password")); assertFalse(safe.contains("user"))
    }
    @Test fun updateVersionsAndExactChecksumValidation() {
        assertTrue(UpdateRules.newer("1.10.0", "1.9.0")); assertFalse(UpdateRules.newer("1.0.0", "1.0.0"))
        val hash = "a".repeat(64); assertEquals(hash, UpdateRules.checksum("$hash  app.apk", "app.apk"))
        rejects { UpdateRules.checksum("$hash  app.apk\n$hash  app.apk", "app.apk") }
        rejects { UpdateRules.version("../bad") }
    }
    @Test fun sessionDeadlinesHandleSleepAndCancellation() {
        val d = SessionDeadline.fromMinutes(15, 1000)
        assertEquals(901000L, d); assertFalse(SessionDeadline.expired(d, 900000)); assertTrue(SessionDeadline.expired(d, 2000000))
        assertFalse(SessionDeadline.expired(SessionDeadline.fromMinutes(0, 1000), 2000000))
        rejects { SessionDeadline.fromMinutes(-1, 1000) }; rejects { SessionDeadline.fromMinutes(1441, 1000) }
    }
}
