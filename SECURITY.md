# Security · امنیت

This is an early preview, not an audited privacy product. An **optional persistent WFP Kill Switch** is available; it is off by default. When off, direct traffic may resume after the app/core closes. When armed, the application-owned filters remain until explicit recovery. Executable matching depends on OS process discovery and is not a security boundary.

## Implemented boundaries

- Renderer sandbox and context isolation; no Node integration, remote pages or renderer network access.
- Narrow, sender-validated IPC; imported strings become text nodes, not HTML.
- Structured importers; imported shell hooks, OpenVPN scripts/plugins and arbitrary engine JSON are rejected.
- Current-user DPAPI encryption for stored profiles; no plaintext fallback when encryption is unavailable.
- Restricted ACLs on the private/runtime directories. Short-lived engine configuration files contain secrets in plaintext while the engine runs. They are deleted on normal shutdown/next launch; a crash or power loss can leave them until cleanup. This is documented, not described as encryption of runtime files.
- Official pinned upstream archive SHA-256; per-launch binary integrity checks. Local administrators can replace the entire installed application, so these checks do not defeat an already compromised administrator account.
- Loopback-only authenticated control API with a random per-session token.
- A native Windows Job Object guardian supervises the managed core; this does not guarantee zero route/DNS side effects on every Windows failure mode.
- No telemetry, remote subscription fetching, account backend or automatic update channel.

## Persistent Kill Switch boundaries

See [KILL_SWITCH.md](docs/KILL_SWITCH.md). Both IP versions are filtered at outbound connect and inbound accept ALE layers. Only our provider/sublayer is changed. Rules are committed atomically; malformed policy input does not clear an existing lock. Loopback, the bundled engine, the actual TUN interface and narrowly defined DHCP/IPv6 neighbor discovery are exceptions. The engine needs physical access to establish the encrypted transport and bootstrap DNS.

The lock is not protection against a local administrator, kernel compromise, disabled BFE, another product's privileged interception, early boot before BFE loads policy, or an unselected helper executable. App mode does not block DoH from an unselected process or prevent deliberate relaying through an unselected local proxy. Shared Windows DNS remains direct on LAN/Wi-Fi in app mode, including queries on behalf of selected apps; this mode does not claim DNS anonymity. No global DNS-port blocks are installed. Real-device UDP/IPv6, existing-flow reauthorization, reboot and third-party firewall interoperability still require manual validation.

## Network limitations

Entire-system mode tunnels ordinary DNS with direct bootstrap for initial server resolution. Selected-app mode preserves adapter DNS and uses the existing network resolver for bootstrap; shared Windows DNS stays direct, while app-owned DNS/DoH follows the executable rule. Helper processes, existing sockets, unsupported upstream transports, IPv6 and VPN-server routes require real-device testing. No claim of perfect leak prevention, censorship resistance or anonymity is made. The startup test tries `https://1.1.1.1/cdn-cgi/trace`, then `https://www.gstatic.com/generate_204`, always through the chosen VPN output and with normal TLS certificate validation. WireGuard peer names are resolved by the core’s configured bootstrap resolver, so an active system lock does not require granting the UI or Windows DNS service physical access. On IPv4-only networks the compatible client bind requests A records. No direct fallback is used to make a failed VPN appear healthy.

The installed application currently runs with Administrator privileges to manage its TUN adapter. The UI only loads packaged local files. A future least-privilege Windows service split is a development goal, not a feature of this release.

## Reporting

Never post private keys, credentials, production profiles or unredacted traffic logs in public issues. If repository private vulnerability reporting is enabled, use its Security tab. Otherwise open a minimal issue asking for a private reporting channel, without exploit credentials or sensitive details.

## فارسی

این نسخه ممیزی امنیتی مستقل نشده است. Kill Switch اختیاری و به‌صورت پیش‌فرض خاموش است؛ اگر روشن نباشد توقف موتور می‌تواند اینترنت مستقیم را برگرداند. اگر مسلح شده باشد، فیلترهای ویندوز تا بازیابی صریح باقی می‌مانند. پروفایل‌ها روی دیسک با DPAPI رمزگذاری می‌شوند، اما فایل موقت موتور هنگام اجرا متن ساده و دارای ACL محدود است. این فایل پس از خروج عادی یا اجرای بعدی پاک می‌شود و ممکن است پس از قطع برق باقی بماند. برنامه برای مدیریت تونل با دسترسی Administrator اجرا می‌شود.

کلید خصوصی، رمز عبور، کانفیگ واقعی و لاگ حساس را در Issue عمومی منتشر نکن. آزمایش عملی IPv4/IPv6، DNS، پردازش‌های کمکی و رفتار قطع اتصال روی ویندوز ضروری است.
