# Validation · اعتبارسنجی

Version: **0.1.0 Preview**. Engine: **sing-box 1.14.3**.

## Checks

| Check | What it establishes |
| --- | --- |
| `npm test` | Protocol parsing, rejected unsafe/unsupported inputs, exact app-path rules, DNS routing policy and redaction behavior |
| `npm run check:engine` | 22 generated profile/mode combinations accepted by the pinned engine’s checker |
| `npm run test:ui` | RTL/LTR, local fonts, theme changes, footer visibility, page navigation, errors and safe profile-name rendering |
| `node scripts/guardian-smoke.cjs` (Windows) | Managed child exits and local API closes after normal parent stop and abrupt guardian termination |
| Windows workflow | Native compilation, the checks above, installer generation and checksums on a Windows runner |

Core configuration validation does not establish a successful protocol handshake with a real provider. UI tests use an explicit mock IPC bridge; screenshots show a disconnected interface, not a live VPN session.

## Manual real-device release checks still needed

- Install/uninstall on Windows 10 build 19045 and Windows 11 x64.
- Verify UAC, DPAPI persistence and account switching.
- Test a live server for every supported protocol, including OpenVPN authentication variants within scope.
- Compare exit IPs from a selected app and an unselected app in each mode.
- Check UDP, IPv6, ordinary DNS, browser DoH, helper executables, existing connections and local network access.
- Verify disconnect, app Quit, network loss, Windows sleep/resume and forced process termination; inspect resulting adapters/routes/DNS.

No independent penetration test, code-signing certificate or zero-leak guarantee is included. See [SECURITY.md](../SECURITY.md).

آزمون‌های خودکار به معنای آزمون اتصال واقعی تمام ارائه‌دهنده‌ها نیستند. برای اطمینان از مسیریابی، DNS، IPv6 و رفتار کرش باید نسخهٔ نصب‌شده روی ویندوز با سرور واقعی آزمایش شود. این نسخهٔ اولیه به‌عنوان محصول ممیزی‌شده یا دارای جلوگیری قطعی از نشت معرفی نمی‌شود.
