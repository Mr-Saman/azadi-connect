# Security · امنیت

This is an early preview, not an audited privacy product. It has **no firewall kill switch**. Direct traffic may resume when the app/core closes or crashes. Executable matching depends on OS process discovery and is not a security boundary.

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

## Network limitations

Ordinary DNS is tunneled for all apps during an active session, with direct bootstrap DNS for initial server resolution. Helper processes, existing sockets, unsupported upstream transports, IPv6 and VPN-server routes require real-device testing. No claim of perfect leak prevention, censorship resistance or anonymity is made. The startup test contacts `https://www.gstatic.com/generate_204` through the chosen VPN output to check connectivity.

The installed application currently runs with Administrator privileges to manage its TUN adapter. The UI only loads packaged local files. A future least-privilege Windows service split is a development goal, not a feature of this release.

## Reporting

Never post private keys, credentials, production profiles or unredacted traffic logs in public issues. If repository private vulnerability reporting is enabled, use its Security tab. Otherwise open a minimal issue asking for a private reporting channel, without exploit credentials or sensitive details.

## فارسی

این نسخه ممیزی امنیتی مستقل نشده و Kill Switch ندارد. توقف یا کرش می‌تواند اتصال مستقیم را برگرداند. پروفایل‌ها روی دیسک با DPAPI رمزگذاری می‌شوند، اما فایل موقت موتور هنگام اجرا متن ساده و دارای ACL محدود است. این فایل پس از خروج عادی یا اجرای بعدی پاک می‌شود و ممکن است پس از قطع برق باقی بماند. برنامه برای مدیریت تونل با دسترسی Administrator اجرا می‌شود.

کلید خصوصی، رمز عبور، کانفیگ واقعی و لاگ حساس را در Issue عمومی منتشر نکن. آزمایش عملی IPv4/IPv6، DNS، پردازش‌های کمکی و رفتار قطع اتصال روی ویندوز ضروری است.
