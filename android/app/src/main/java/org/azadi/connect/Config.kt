package org.azadi.connect

import org.json.JSONArray
import org.json.JSONObject

object Config {
    fun build(profile: Profile, port: Int, secret: String): String {
        require(port in 1..65535 && secret.length >= 32)
        val endpoint = JSONObject(profile.endpoint).put("tag", "vpn")
        val isEndpoint = endpoint.getString("type") in listOf("wireguard", "openvpn-client")
        val bootstrap = obj("type" to "udp", "tag" to "bootstrap", "server" to "1.1.1.1", "server_port" to 53)
        val secure = if (profile.dns.isNotEmpty()) obj("type" to "udp", "tag" to "secure-dns", "server" to profile.dns.first(), "server_port" to 53, "detour" to "vpn")
            else obj("type" to "tls", "tag" to "secure-dns", "server" to "1.1.1.1", "server_port" to 853, "tls" to obj("enabled" to true, "server_name" to "cloudflare-dns.com"), "detour" to "vpn")
        return obj(
            "log" to obj("level" to "warn", "timestamp" to false),
            "dns" to obj("servers" to arr(listOf(bootstrap, secure)), "final" to "secure-dns", "strategy" to "prefer_ipv4"),
            "inbounds" to arr(listOf(obj("type" to "tun", "tag" to "azadi-tun", "address" to arr(listOf("172.29.215.1/30", "fd72:98c4:51af::1/126")), "mtu" to 1400, "auto_route" to true, "stack" to "mixed"))),
            "outbounds" to arr(if (isEndpoint) listOf(obj("type" to "direct", "tag" to "direct")) else listOf(obj("type" to "direct", "tag" to "direct"), endpoint)),
            "route" to obj("auto_detect_interface" to true, "default_domain_resolver" to "bootstrap", "rules" to arr(listOf(obj("port" to 53, "action" to "hijack-dns"))), "final" to "vpn"),
            "experimental" to obj("clash_api" to obj("external_controller" to "127.0.0.1:$port", "secret" to secret))
        ).apply { if (isEndpoint) put("endpoints", JSONArray().put(endpoint)) }.toString()
    }
}
object Diagnostics {
    fun safe(message: String, profile: Profile?): String {
        val secrets = mutableListOf<String>()
        fun walk(value: Any?, key: String = "") {
            when (value) {
                is JSONObject -> value.keys().forEach { walk(value.opt(it), it) }
                is JSONArray -> (0 until value.length()).forEach { walk(value.opt(it), key) }
                is String -> if (Regex("private|password|username|uuid|secret|token|certificate|client_key|pre_shared", RegexOption.IGNORE_CASE).containsMatchIn(key)) {
                    secrets += value; secrets += value.lines().filter { it.isNotBlank() && !it.startsWith("-----") }
                }
            }
        }
        profile?.let { walk(JSONObject(it.endpoint)) }
        var result = message
        secrets.filter { it.isNotEmpty() }.sortedByDescending { it.length }.forEach { result = result.replace(it, "[redacted]") }
        return result.replace(Regex("[A-Za-z0-9+/]{40,}={0,2}"), "[redacted]").take(1800)
    }
}
