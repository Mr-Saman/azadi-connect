# Changelog · تغییرات 🚀

## 0.2.0 — Preview

- Add optional persistent Windows WFP Kill Switch for exact executable scope or the whole system; protect both IP versions.
- Keep the lock after disconnect, engine failure or application exit; add in-app/tray/Start recovery and safe uninstall behavior.
- Separate engine failure from missing-Kill-Switch messaging; show redacted, copyable diagnostics with stage and exit code.
- Prevent an engine exit during the outbound probe from being reported as a successful connection.
- Add native Wintun and firewall integration checks on an isolated Windows runner, plus connection state and UI regression checks.
- Add bilingual Kill Switch recovery and public code-signing guides. The preview remains unsigned.

## 0.1.0 — Preview

- Add validated WireGuard, modern VMess/VLESS, Shadowsocks, Trojan, Hysteria2, TUIC, OpenVPN TLS/TUN and proxy-link imports.
- Add exact-executable routing and an entire-system TUN mode with documented DNS behavior.
- Add Persian/RTL and English/LTR, local Vazir/Inter fonts, dark/light themes and the “برای ایران ❤️ / For Iran ❤️” footer.
- Add DPAPI storage, restrictive runtime ACLs, authenticated local control and binary integrity checks.
- Add Windows native child supervision, a branded NSIS EXE installer and release automation.
- Document current limitations: no kill switch, no independent audit, and live provider/Windows networking tests still required.

این نخستین نسخهٔ پیش‌نمایش پروژه است و کد برنامه، رابط و مستندات با ChatGPT تولید شده‌اند.
