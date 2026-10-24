# Changelog · تغییرات 🚀

## 0.4.1 — Preview

- Fix WireGuard UDP6 bind/update failures for IPv4 peers: use a non-empty direct transport with the core's connected UDP client bind instead of the standard dual socket bind.
- Resolve peer hostnames before tunnel setup with IPv4 preference; preserve saved profiles, inner IPv6 and AllowedIPs.
- Read native IPv6 default-route availability; fail unselected TUN IPv6 quickly when absent while retaining selected IPv6 in the VPN.
- Try an IPv4 HTTPS health target and a second independent target through the VPN; require a finite non-negative delay and retain honest failure reporting.
- Add a real encrypted WireGuard handshake regression on disposable Windows with physical IPv6 disabled, adapter rebind and wrong-key checks.

رفع خطای bind سوکت IPv6 در اتصال WireGuard به سرورهای IPv4، بهبود آزمون سلامت اتصال و آزمون واقعی تبادل رمزگذاری‌شدهٔ WireGuard در این نسخه اضافه شد.

## 0.4.0 — Preview

- Preserve ordinary LAN/Wi-Fi Internet for unselected apps: disable app-mode DNS hijacking/strict DNS filtering and use the existing network resolver for bootstrap.
- Limit app Kill Switch filters to selected executables; atomically migrate persistent policies from older versions on startup.
- Test the production TUN generator with selected/unselected HTTPS and fresh Windows/shared/raw DNS, including VPN failure and core crash.
- Support reinstall/upgrade with preserved profiles and protection, cooperative shutdown for 0.4+ and a tray/Retry prompt for older versions.
- Add localized finish-page Run and shortcut-to-pin checkboxes, consistent shortcut/AppUserModelID identity and an in-app shortcut action.
- Exercise actual install, repair over a running copy and uninstall on disposable Windows CI.
- Fix GPU/renderer startup rejection under Administrator: use an asInvoker application manifest with explicit UAC relaunch for the supervisor, retaining the renderer/GPU sandbox.

این نسخه اینترنت و DNS عادی برنامه‌های انتخاب‌نشده را حفظ می‌کند؛ نصب مجدد، تیک اجرای پس از نصب و نمایش میانبر برای پین به Start یا تسک‌بار هم اضافه شده است.

## 0.3.0 — Preview

- Safely stop the existing network-lock service during upgrades without unlocking its persistent policy; wait for process exit before replacing its executable.
- Fix sing-box 1.14 startup failure: remove the redundant empty-direct DNS detour and deprecated `independent_cache` setting.
- Execute generated DNS settings in a real core-startup regression test, in both routing modes with TLS/profile DNS.
- Fit the overview to the minimum desktop size; keep header/footer fixed and scroll long content within one pane.
- Show executable icons for running/selected Windows apps with bounded cached extraction and a fallback.
- Search both application lists by name or path, without case sensitivity.
- Add localized GitHub star support cards in the application and outlined SVG banners in both README guides.
- Remove ChatGPT attribution from the application interface; retain the full attribution in README.
- Refresh the project icon and add an optimized Persian promotional WebP only in the Persian README section.

رفع خطای DNS، اصلاح اسکرول، آیکون و جست‌وجوی برنامه‌ها، حمایت با استار و پوستر تازه در این نسخه ارائه شده‌اند.

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
