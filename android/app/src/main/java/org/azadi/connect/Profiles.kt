package org.azadi.connect

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.UUID

fun obj(vararg pairs: Pair<String, Any?>) = JSONObject().apply { pairs.forEach { put(it.first, it.second) } }
fun arr(values: Iterable<*>) = JSONArray().apply { values.forEach { put(it) } }
fun JSONArray.strings() = (0 until length()).map { getString(it) }
data class Profile(val id: String = UUID.randomUUID().toString(), val name: String, val endpoint: String, val dns: List<String> = emptyList()) {
    val protocol: String get() = JSONObject(endpoint).getString("type")
    val server: String get() = JSONObject(endpoint).let { it.optString("server").ifEmpty { it.optJSONArray("peers")?.optJSONObject(0)?.optString("address") ?: it.optJSONArray("servers")?.optJSONObject(0)?.optString("server").orEmpty() } }
    fun json() = obj("id" to id, "name" to name, "endpoint" to JSONObject(endpoint), "dns" to arr(dns))
    companion object { fun from(j: JSONObject) = Profile(j.getString("id"), j.getString("name"), j.getJSONObject("endpoint").toString(), j.optJSONArray("dns")?.strings().orEmpty()) }
}
object Profiles {
    const val MAX_BYTES = 2 * 1024 * 1024
    private fun need(ok: Boolean, message: String) { require(ok) { message } }
    private fun text(s: String, label: String): String { need(s.isNotBlank() && s.length <= 4096 && s.none { it.code < 32 && it !in "\n\r\t" }, "Invalid $label"); return s.trim() }
    private fun decode(s: String) = URLDecoder.decode(s.replace("+", "%2B"), StandardCharsets.UTF_8.name())
    private fun b64(s: String) = String(Base64.getDecoder().decode(s.replace('-', '+').replace('_', '/')), StandardCharsets.UTF_8)
    private fun host(s: String): String { val h = s.removePrefix("[").removeSuffix("]"); need(h.isNotBlank() && h.length <= 253 && h.matches(Regex("[a-zA-Z0-9.:-]+")) && !h.contains(".."), "Invalid server"); return h }
    private fun port(s: String?, fallback: Int = 443): Int { val p = if (s.isNullOrEmpty() || s == "-1") fallback else s.toIntOrNull(); need(p != null && p in 1..65535, "Invalid port"); return p!! }
    private fun uuid(s: String): String { need(s.matches(Regex("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")), "Invalid UUID"); return s }
    private fun key(s: String): String { need(s.matches(Regex("[A-Za-z0-9+/]{43}=")) && Base64.getDecoder().decode(s).size == 32, "Invalid WireGuard key"); return s }
    fun cidr(s: String): String {
        val a = s.trim().split('/'); need(a.size == 2, "Invalid IP prefix")
        val bits = a[1].toIntOrNull(); val ipv6 = a[0].contains(':')
        val valid = if (ipv6) a[0].matches(Regex("[a-fA-F0-9:]+")) && runCatching { java.net.InetAddress.getByName(a[0]) is java.net.Inet6Address }.getOrDefault(false)
            else a[0].split('.').let { it.size == 4 && it.all { n -> n.toIntOrNull() in 0..255 && n.matches(Regex("[0-9]{1,3}")) } }
        need(valid && bits != null && bits in 0..if (ipv6) 128 else 32, "Invalid IP prefix"); return s.trim()
    }
    fun import(raw: String, filename: String = "", username: String = "", password: String = ""): List<Profile> {
        need(raw.toByteArray().size <= MAX_BYTES && raw.isNotBlank(), "Profile is empty or exceeds 2 MiB")
        val value = raw.removePrefix("\uFEFF").trim(); val name = filename.substringBeforeLast('.', filename).take(100)
        if (value.contains("[Interface]", true)) return listOf(wireguard(value, name))
        if (filename.endsWith(".ovpn", true) || Regex("(?m)^client\\s*$").containsMatchIn(value) || value.contains("<ca>")) return listOf(openvpn(value, name, username, password))
        need(!value.startsWith("{") && !value.startsWith("["), "Raw engine JSON is not supported")
        var lines = value.lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (lines.size == 1 && !lines[0].contains("://")) lines = b64(value).lines().map { it.trim() }.filter { it.isNotEmpty() }
        need(lines.size in 1..200, "Import 1–200 profiles")
        return lines.map { link(it, if (lines.size == 1) name else "") }
    }
    fun link(raw: String, name: String = ""): Profile {
        if (raw.startsWith("vmess://")) {
            val v = JSONObject(b64(raw.substring(8))); need(v.optString("aid", "0") in listOf("", "0") && v.optString("type", "none") in listOf("", "none"), "Legacy VMess headers are unsupported")
            val e = obj("type" to "vmess", "server" to host(v.getString("add")), "server_port" to port(v.optString("port")), "uuid" to uuid(v.getString("id")), "security" to v.optString("scy", "auto"), "alter_id" to 0)
            val p = mapOf("type" to v.optString("net", "tcp"), "security" to v.optString("tls", "none"), "sni" to v.optString("sni"), "host" to v.optString("host"), "path" to v.optString("path", "/"), "serviceName" to v.optString("path"), "alpn" to v.optString("alpn"), "fp" to v.optString("fp"))
            transport(p)?.let { e.put("transport", it) }; tls(p, e.getString("server"), false)?.let { e.put("tls", it) }
            return Profile(name = name.ifEmpty { v.optString("ps", "VMess") }.take(100), endpoint = e.toString())
        }
        if (raw.startsWith("ss://")) {
            val body = raw.substring(5).substringBefore('#'); need(!body.contains('?'), "Shadowsocks plugins/options are unsupported")
            val authority = if (body.contains('@')) body else b64(body)
            val auth = authority.substringBeforeLast('@'); val cred = if (auth.contains(':')) decode(auth) else b64(auth)
            need(cred.contains(':'), "Invalid Shadowsocks credentials")
            val u = URI("ss://" + authority.substringAfterLast('@'))
            val e = obj("type" to "shadowsocks", "server" to host(u.host ?: ""), "server_port" to port(u.port.toString()), "method" to text(cred.substringBefore(':'), "cipher"), "password" to text(cred.substringAfter(':'), "password"))
            return Profile(name = name.ifEmpty { decode(raw.substringAfter('#', "Shadowsocks")) }.take(100), endpoint = e.toString())
        }
        val u = URI(raw); val type = if (u.scheme == "hy2") "hysteria2" else u.scheme
        need(type in listOf("vless", "trojan", "hysteria2", "tuic", "socks", "socks5", "http", "https"), "Unsupported protocol")
        val p = linkedMapOf<String, String>()
        u.rawQuery?.split('&')?.filter { it.isNotEmpty() }?.forEach { val k = decode(it.substringBefore('=')); need(!p.containsKey(k), "Duplicate link option"); p[k] = decode(it.substringAfter('=', "")) }
        val allowed = setOf("type", "network", "security", "sni", "peer", "alpn", "fp", "pbk", "sid", "path", "host", "serviceName", "flow", "encryption", "allowInsecure", "insecure", "obfs", "obfs-password", "congestion_control", "udp_relay_mode")
        need(p.keys.all { it in allowed }, "Unsupported link option")
        need(p["encryption"] == null || p["encryption"] == "none", "Unsupported encryption")
        val e = obj("type" to when (type) { "socks5" -> "socks"; "https" -> "http"; else -> type }, "server" to host(u.host ?: ""), "server_port" to port(u.port.toString(), when (type) { "http" -> 80; "socks", "socks5" -> 1080; else -> 443 }))
        val user = u.rawUserInfo.orEmpty().substringBefore(':'); val pass = u.rawUserInfo.orEmpty().substringAfter(':', "")
        when (type) {
            "vless" -> { e.put("uuid", uuid(decode(user))); p["flow"]?.let { e.put("flow", it) } }
            "trojan" -> e.put("password", text(decode(user), "password"))
            "tuic" -> { e.put("uuid", uuid(decode(user))); e.put("password", text(decode(pass), "password")); listOf("congestion_control", "udp_relay_mode").forEach { k -> p[k]?.let { e.put(k, it) } } }
            "hysteria2" -> { e.put("password", text(decode(u.rawUserInfo.orEmpty()), "password")); p["obfs"]?.let { need(it == "salamander", "Unsupported obfuscation"); e.put("obfs", obj("type" to it, "password" to text(p["obfs-password"].orEmpty(), "obfuscation password"))) } }
            "http", "https", "socks", "socks5" -> { if (user.isNotEmpty()) e.put("username", decode(user)); if (pass.isNotEmpty()) e.put("password", decode(pass)) }
        }
        if (type in listOf("vless", "trojan")) transport(p)?.let { e.put("transport", it) }
        tls(p, e.getString("server"), type in listOf("trojan", "tuic", "hysteria2", "https"))?.let { e.put("tls", it) }
        return Profile(name = name.ifEmpty { decode(u.rawFragment ?: type!!) }.take(100), endpoint = e.toString())
    }
    private fun transport(p: Map<String, String>): JSONObject? = when (val type = p["type"]?.ifEmpty { null } ?: p["network"] ?: "tcp") {
        "tcp", "" -> null
        "ws" -> obj("type" to "ws", "path" to (p["path"] ?: "/")).apply { p["host"]?.takeIf { it.isNotEmpty() }?.let { put("headers", obj("Host" to it)) } }
        "grpc" -> obj("type" to "grpc", "service_name" to (p["serviceName"] ?: ""))
        "httpupgrade" -> obj("type" to type, "path" to (p["path"] ?: "/")).apply { p["host"]?.takeIf { it.isNotEmpty() }?.let { put("host", it) } }
        else -> error("Unsupported transport")
    }
    private fun tls(p: Map<String, String>, server: String, mandatory: Boolean): JSONObject? {
        need(p["allowInsecure"] !in listOf("true", "1") && p["insecure"] !in listOf("true", "1"), "Insecure TLS is unsupported")
        val security = p["security"]?.ifEmpty { null } ?: if (mandatory) "tls" else "none"
        if (security == "none") { need(!mandatory, "TLS is required"); return null }
        need(security in listOf("tls", "reality"), "Unsupported TLS")
        return obj("enabled" to true, "server_name" to (p["sni"]?.ifEmpty { null } ?: p["peer"]?.ifEmpty { null } ?: server)).apply {
            p["alpn"]?.takeIf { it.isNotEmpty() }?.let { put("alpn", arr(it.split(','))) }
            if (!p["fp"].isNullOrEmpty() || security == "reality") put("utls", obj("enabled" to true, "fingerprint" to (p["fp"]?.ifEmpty { null } ?: "chrome")))
            if (security == "reality") put("reality", obj("enabled" to true, "public_key" to text(p["pbk"].orEmpty(), "Reality key"), "short_id" to p["sid"].orEmpty()))
        }
    }
    private fun wireguard(raw: String, name: String): Profile {
        var iface: MutableMap<String, String>? = null; var section: MutableMap<String, String>? = null; val peers = mutableListOf<MutableMap<String, String>>()
        raw.lines().forEach { original ->
            val line = original.replace(Regex("\\s*[#;].*$"), "").trim()
            when {
                line.isEmpty() -> Unit
                line.equals("[Interface]", true) -> { need(iface == null, "Duplicate Interface"); iface = linkedMapOf(); section = iface }
                line.equals("[Peer]", true) -> { section = linkedMapOf(); peers.add(section!!) }
                else -> { need(section != null && line.contains('='), "Invalid WireGuard line"); val k = line.substringBefore('=').trim().lowercase(); val allowed = if (section === iface) setOf("privatekey", "address", "dns", "mtu", "listenport") else setOf("publickey", "presharedkey", "endpoint", "allowedips", "persistentkeepalive"); need(k in allowed && !section!!.containsKey(k), "Unsupported or duplicate WireGuard field"); section!![k] = line.substringAfter('=').trim() }
            }
        }
        val i = requireNotNull(iface) { "Missing Interface" }; need(peers.size in 1..32, "WireGuard requires peers")
        val e = obj("type" to "wireguard", "system" to false, "address" to arr(text(i["address"].orEmpty(), "address").split(',').map { cidr(it) }), "private_key" to key(i["privatekey"].orEmpty()), "peers" to arr(peers.map { p ->
            val address = Regex("^(?:\\[([^]]+)\\]|([^:]+)):(\\d+)$").matchEntire(p["endpoint"].orEmpty()) ?: error("Invalid WireGuard endpoint")
            obj("address" to host(address.groupValues[1].ifEmpty { address.groupValues[2] }), "port" to port(address.groupValues[3]), "public_key" to key(p["publickey"].orEmpty()), "allowed_ips" to arr(text(p["allowedips"].orEmpty(), "AllowedIPs").split(',').map { cidr(it) })).apply {
                p["presharedkey"]?.let { put("pre_shared_key", key(it)) }
                p["persistentkeepalive"]?.let { need(it.toIntOrNull() in 0..65535, "Invalid keepalive"); put("persistent_keepalive_interval", it.toInt()) }
            }
        }))
        i["mtu"]?.let { need(it.toIntOrNull() in 1280..9000, "Invalid MTU"); e.put("mtu", it.toInt()) }
        i["listenport"]?.let { need(it.toIntOrNull() in 0..65535, "Invalid ListenPort"); e.put("listen_port", it.toInt()) }
        val dns = i["dns"].orEmpty().split(',').map { it.trim() }.filter { it.matches(Regex("[0-9.]+|[a-fA-F0-9:]+")) && runCatching { cidr(it + if (it.contains(':')) "/128" else "/32") }.isSuccess }
        return Profile(name = name.ifEmpty { "WireGuard" }, endpoint = e.toString(), dns = dns)
    }
    private fun openvpn(raw: String, name: String, username: String, password: String): Profile {
        val blocks = linkedMapOf<String, String>()
        val clean = Regex("<([a-z][a-z0-9-]*)>\\s*([\\s\\S]*?)\\s*</\\1>", RegexOption.IGNORE_CASE).replace(raw) { m -> val k = m.groupValues[1].lowercase(); need(!blocks.containsKey(k), "Duplicate OpenVPN block"); blocks[k] = m.groupValues[2].trim(); "" }
        need(!clean.contains('<') && !clean.contains('>') && blocks.keys.all { it in setOf("ca", "cert", "key", "tls-auth", "tls-crypt", "tls-crypt-v2") }, "Unsupported OpenVPN block")
        val tls = obj("version_min" to "1.2", "remote_certificate_tls" to "server")
        val servers = JSONArray(); val e = obj("type" to "openvpn-client", "mode" to "tls", "system" to false, "servers" to servers, "route_no_pull" to true, "tls" to tls, "allow_compression" to "no")
        val noop = setOf("client", "tls-client", "pull", "nobind", "persist-key", "persist-tun", "auth-nocache", "verb", "mute", "mute-replay-warnings", "resolv-retry", "connect-retry", "connect-retry-max", "redirect-gateway", "block-outside-dns", "register-dns", "route-nopull", "route-delay", "explicit-exit-notify", "dhcp-option", "sndbuf", "rcvbuf")
        clean.lines().forEach { original ->
            val line = original.trim(); if (line.isEmpty() || line.startsWith('#') || line.startsWith(';')) return@forEach
            val tokens = Regex("\"[^\"\\r\\n]*\"|'[^'\\r\\n]*'|[^\\s]+").findAll(line).map { it.value.trim('\'', '"') }.toList(); val k = tokens[0]; val a = tokens.drop(1); val value = a.firstOrNull().orEmpty()
            when (k) {
                in noop -> Unit
                "dev" -> need(value == "tun", "Only TUN is supported")
                "proto" -> { need(value in listOf("udp", "udp4", "udp6", "tcp", "tcp-client", "tcp4-client", "tcp6-client"), "Unsupported transport"); e.put("network", if (value.startsWith("tcp")) "tcp" else "udp") }
                "remote" -> { need(a.size in 1..3, "Invalid remote"); val r = obj("server" to host(value), "server_port" to port(a.getOrNull(1), 1194)); a.getOrNull(2)?.let { need(it in listOf("udp", "udp4", "udp6", "tcp", "tcp-client", "tcp4-client", "tcp6-client"), "Unsupported remote transport"); r.put("network", if (it.startsWith("tcp")) "tcp" else "udp") }; servers.put(r) }
                "auth-user-pass" -> { need(a.isEmpty(), "External credentials are unsupported"); e.put("username", text(username, "username")); e.put("password", text(password, "password")) }
                "remote-random" -> e.put("remote_random", true)
                "remote-cert-tls" -> need(value == "server", "Server verification is required")
                "tls-version-min" -> { need(value in listOf("1.2", "1.3"), "TLS 1.2+ required"); tls.put("version_min", value) }
                "verify-x509-name" -> { val kind = a.getOrNull(1) ?: "subject"; need(kind in listOf("name", "subject", "name-prefix"), "Unsupported certificate check"); tls.put("server_name", text(value, "server name")); tls.put("server_name_type", kind) }
                "data-ciphers" -> e.put("data_ciphers", arr(text(value, "ciphers").split(':')))
                "cipher", "data-ciphers-fallback" -> { need(value.matches(Regex("AES-(128|192|256)-(GCM|CBC)")) || value == "CHACHA20-POLY1305", "Unsupported cipher"); e.put("data_ciphers_fallback", value) }
                "auth" -> { need(value in listOf("SHA1", "SHA256", "SHA384", "SHA512"), "Unsupported digest"); e.put("auth", value) }
                "key-direction" -> { need(value in listOf("0", "1"), "Invalid key direction"); blocks["direction"] = if (value == "1") "client" else "server" }
                "tun-mtu" -> { need(value.toIntOrNull() in 1280..9000, "Invalid MTU"); e.put("mtu", value.toInt()) }
                "ping", "ping-restart" -> { need(value.toIntOrNull() in 1..86400, "Invalid ping interval"); e.put(if (k == "ping") "ping_interval" else "ping_restart", value + "s") }
                else -> error("Unsupported OpenVPN option: $k")
            }
        }
        need(servers.length() > 0 && !blocks["ca"].isNullOrEmpty(), "Remote and inline CA required")
        need(blocks.containsKey("cert") == blocks.containsKey("key") && !blocks["key"].orEmpty().contains("ENCRYPTED"), "Certificate/key missing or encrypted")
        tls.put("certificate", arr(listOf(blocks.getValue("ca"))))
        blocks["cert"]?.let { tls.put("client_certificate", arr(listOf(it))); tls.put("client_key", arr(listOf(blocks.getValue("key")))) }
        val wraps = listOf("tls-auth", "tls-crypt", "tls-crypt-v2").filter { blocks.containsKey(it) }; need(wraps.size <= 1, "Conflicting TLS wrappers")
        wraps.firstOrNull()?.let { k -> tls.put("control_wrap", obj("type" to k.replace('-', '_'), "key" to arr(listOf(blocks.getValue(k)))).apply { if (k == "tls-auth" && blocks.containsKey("direction")) put("direction", blocks["direction"]) }) }
        return Profile(name = name.ifEmpty { "OpenVPN" }, endpoint = e.toString())
    }
}
