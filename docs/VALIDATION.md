# Validation · اعتبارسنجی

Version: **0.4.1 Preview**. Engine: **sing-box 1.14.3**.

## Checks

| Check | What it establishes |
| --- | --- |
| `npm test` | 28 checks: protocol parsing, rejected unsafe/unsupported inputs, exact app-path rules, DNS routing policy and redaction behavior |
| `npm run check:engine` | 22 generated profile/mode combinations accepted by the pinned engine’s checker |
| `npm run test:ui` | 11 checks: RTL/LTR, local fonts, themes, fixed chrome, overview fitting 980×740 and 1240×850, scrolling long lists, search, icons/fallback, localized support and shortcut/pin action, errors and safe text rendering |
| `npm run test:startup` (Windows) | Four actual generated DNS/mode combinations initialize without deprecated cache warnings or the invalid direct-detour fatal error; synthetic WireGuard endpoint, no TUN or host DNS/route changes |
| `node scripts/guardian-smoke.cjs` (Windows) | Managed child exits and local API closes after normal parent stop and abrupt guardian termination |
| `node scripts/network-lock-smoke.cjs` (disposable Windows runner only) | Real Wintun startup, TCP through an isolated /32 route, TUN permit, persistent per-app/system WFP block after core crash, unselected app access, malformed-policy preservation, engine exception, staged helper replacement with protection preserved, and explicit recovery |
| `node scripts/app-routing-smoke.cjs` (disposable Windows runner only) | Actual production app-mode default TUN routes; selected HTTPS through a synthetic HTTP CONNECT upstream, unrelated HTTPS plus fresh Windows shared DNS and physical UDP DNS, lock off/on, upstream loss and core crash |
| `node scripts/installer-smoke.cjs` (disposable Windows runner only) | Real silent install, version/location/shortcut AppUserModelID, repair over a running installed app, persistent policy and per-user marker preservation, uninstall preserving unrelated files |
| `node scripts/wireguard-smoke.cjs` (disposable Windows runner only) | Production Engine + TUN, real WireGuard key exchange and HTTP over a local encrypted UDP4 link with physical IPv6 temporarily unbound, adapter rebind recovery and wrong-key rejection; restores adapter bindings in finally |
| Windows workflow | Native compilation, the checks above, installer generation and checksums on a Windows runner |

Core configuration validation does not establish a successful protocol handshake with a real provider. Application icon UI tests use mock IPC PNGs; real icon extraction uses Electron’s Windows executable-icon API and still needs a desktop visual check. UI tests use an explicit mock IPC bridge; screenshots show mocked UI states, including error/recovery examples, not a live provider session. Native lock checks use a synthetic direct outbound and numeric public test IP (1.1.1.1:443). The production app-routing regression uses a local HTTP CONNECT upstream forwarding a fixed HTTPS fixture, with normal certificate validation; it proves executable routing and unrelated DNS/HTTPS survival, not provider interoperability. Installer checks preserve a dummy per-user marker, not a real provider vault.

## Manual real-device release checks still needed

- Visually verify finish-page launch/shortcut checkboxes and manual Start/taskbar pinning on Windows 10 build 19045 and Windows 11 x64.
- Upgrade from the 0.3 installer and verify the tray/Retry prompt.
- Verify UAC, DPAPI persistence and account switching.
- Test a live server for every supported protocol, including OpenVPN authentication variants within scope.
- Compare exit IPs from a selected app and an unselected app in each mode.
- Check UDP, IPv6, ordinary DNS, browser DoH, helper executables, existing connections and local network access.
- Check persistent lock after reboot, prior TCP/UDP flows, new network adapters and third-party firewall interactions.
- Verify disconnect, app Quit, network loss, Windows sleep/resume and forced process termination; inspect resulting adapters/routes/DNS.

No independent penetration test, code-signing certificate or zero-leak guarantee is included. See [SECURITY.md](../SECURITY.md).

آزمون‌های خودکار به معنای آزمون اتصال واقعی تمام ارائه‌دهنده‌ها نیستند. برای اطمینان از مسیریابی، DNS، IPv6 و رفتار کرش باید نسخهٔ نصب‌شده روی ویندوز با سرور واقعی آزمایش شود. این نسخهٔ اولیه به‌عنوان محصول ممیزی‌شده یا دارای جلوگیری قطعی از نشت معرفی نمی‌شود.


Live IPv6 traffic is exercised by the native script only if the runner has a usable public IPv6 route; otherwise the log explicitly records that limitation. IPv6 filters are installed in either case. This test intentionally changes routing/filtering on an ephemeral CI machine and refuses to run as a normal desktop test.

The Linux editing sandbox denies netlink socket creation even without a TUN inbound. Runtime startup validation therefore runs on the Windows workflow; it is not reported as a successful Linux runtime test.

Installer packaging uses solid zlib. The pinned builder enforces a four-minute NSIS compiler timeout; solid LZMA exceeded it on a shared Windows runner. The compressor change trades a larger installer for predictable build time.

WireGuard peer hostnames are resolved before TUN startup using the current OS resolver, preferring an available IPv4 address; resolution is refreshed on reconnect. The CI fixture uses fresh synthetic keys and a private local HTTP endpoint inside the encrypted WireGuard link. Production health checks use HTTPS with normal certificate validation and never use direct-outbound fallback. This test does not validate a user’s server, UDP reachability, credentials or provider policy.

An explicitly fixed WireGuard `ListenPort` is preserved and retains the core’s standard bind, because sing-box forbids combining that field with a detour. On a machine affected by the UDP6 bind failure, use an automatic source port (`ListenPort=0` or omit it) when the provider permits, or repair the machine’s native IPv6 path. IPv6-only peer endpoints also require native IPv6.
