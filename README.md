<div align="center">

<img src="ui/assets/icon.svg" width="90" alt="Azadi Connect logo">

# Azadi Connect · آزادی کانکت

### Your connection. Your choice. 🌐

**A local-first, bilingual Windows VPN client with application routing.**

🇮🇷 **برای ایران ❤️ · For Iran ❤️**

**Windows 10/11 x64** · **فارسی / English** · **GPL-3.0-or-later** · **v0.1.0 Preview**

[English guide](#english) · [راهنمای فارسی](#فارسی) · [Architecture](docs/ARCHITECTURE.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## English

![Azadi Connect English interface](docs/screenshots/english-dark.png)

*Disconnected interface preview. Screenshots do not represent a live VPN session.*

### ✨ What is Azadi Connect?

Azadi Connect brings your own VPN profiles into one desktop interface. Choose individual Windows applications, or route the entire system through your selected connection. Switch between English/LTR and Persian/RTL instantly, with bundled Inter and Vazir fonts and no CDN dependencies.

> 🤖 **This project was generated entirely with ChatGPT**, including the application code, interface design, documentation and build scripts. Independent third-party software—including sing-box, Electron and the fonts—belongs to its original authors and is credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### 🪟 Install on Windows

1. Open this repository’s **Releases** page and download `Azadi-Connect-0.1.0-Windows-x64-Setup.exe` when attached to the release.
2. Run the installer and accept the Windows Administrator/UAC request. The installer offers an installation directory and shortcuts.
3. Open **Azadi Connect → Add profile**. Import your configuration, or paste a share link.
4. Choose **Selected applications** and add the actual `.exe` paths, or choose **Entire system**.
5. Click **Connect**. A connection is marked verified only after a request through the VPN outbound succeeds.

🔐 Profiles are encrypted for the current Windows account with DPAPI. They are never committed, uploaded to GitHub or sent to an Azadi service. You supply your own functioning server; this project does not provide free VPN servers or accounts.

**Release status:** this is an unsigned preview. Windows can display an unknown-publisher notice. The source and SHA-256 checksums are provided for inspection; there is no claim of independent security auditing. Windows routing, DNS and real-provider compatibility still require testing on your own device. An existing WireGuard/OpenVPN client is not required for supported imports; the engine is bundled.

### 🧩 Supported imports

| Protocol / format | Import | Selected apps | Entire system | Scope |
| --- | --- | --- | --- | --- |
| WireGuard | `.conf` or configuration text | ✅ | ✅ | Multiple peers, IPv4/IPv6 endpoints, keys, DNS, MTU, keepalive and AllowedIPs |
| VLESS / Reality | `vless://` | ✅ | ✅ | TCP, WebSocket, gRPC, HTTPUpgrade; Reality and TLS |
| VMess | `vmess://` JSON-base64 | ✅ | ✅ | Modern `alterId=0`; supported transports only |
| Shadowsocks | `ss://` | ✅ | ✅ | SIP002 and full-base64 links; no external plugins |
| Trojan | `trojan://` | ✅ | ✅ | TLS and supported transports |
| Hysteria2 | `hysteria2://`, `hy2://` | ✅ | ✅ | TLS; optional Salamander obfuscation |
| TUIC | `tuic://` | ✅ | ✅ | UUID/password profiles with TLS |
| OpenVPN | `.ovpn` or configuration text | ✅ | ✅ | TLS/TUN, inline CA/certificate/key and optional username/password |
| SOCKS5 / HTTP(S) | Share links | ✅ | ✅* | Upstream-dependent protocol support; HTTP cannot carry arbitrary UDP |
| Offline list | `.txt` or pasted lines/base64 | ✅ | ✅ | 1–200 supported share links per import |

✅ means an implemented importer and routing path, validated against the pinned core’s configuration checker. It does **not** mean every provider, authentication method or network has passed a live interoperability test. See [VALIDATION.md](docs/VALIDATION.md).

\* SOCKS and plain HTTP do not inherently encrypt your traffic. Unsupported upstream traffic fails rather than being deliberately sent direct by a fallback rule.

**Explicitly unsupported:** raw V2Ray/Xray/sing-box/Clash JSON or YAML, remote subscription fetching, XHTTP, legacy VMess headers/alterId, Shadowsocks plugins, OpenVPN TAP/MFA/encrypted private keys/external file references, scripts and plugins, proprietary VPN clients, IPsec and arbitrary “VPN extensions.” Unsupported options produce an error; no imported shell hooks are executed. Some non-security OpenVPN options such as verbosity and reconnect hints are intentionally ignored; see the importer source for the exact allowlist.

### 🎛️ Two routing modes

- **Selected applications:** exact executable-path rules go through the VPN. Other application traffic is forwarded directly. Add helper executables separately where an app uses them. Close old app connections after changing routing.
- **Entire system:** the default outbound is the VPN for traffic captured by the TUN interface, including IPv4 and IPv6. WireGuard `AllowedIPs` are preserved; a private-network-only profile cannot become a full internet VPN by changing the UI switch.

**DNS policy:** ordinary system DNS uses the tunnel in both modes. The engine’s initial server hostname resolution uses a direct bootstrap resolver (`1.1.1.1`). Other DNS uses a WireGuard profile’s first DNS IP, or Cloudflare DNS-over-TLS through the VPN. Applications with built-in DoH follow their own application route. This is not a promise of absolute leak prevention.

**No kill switch:** direct connectivity may resume after an application/core crash or exit. The native guardian cleans up the managed child, but it is not a firewall kill switch. Process identification is not a strict security boundary. Local LAN destinations receive the same policy as other destinations; there is no hidden LAN bypass.

### 💎 Included features

- 🌗 Dark and light themes, locally bundled fonts and original vector icons.
- 🗂️ Multiple profiles, active-profile selection and offline batch imports.
- 🧭 Executable picker and a list of running Windows applications.
- 🔒 DPAPI profile vault, restricted runtime directory ACLs and pinned engine integrity checks.
- 🛡️ Sandboxed renderer, narrow IPC bridge, denied navigation and remote network requests.
- 💓 Actual outbound connectivity check before showing a verified connection.
- 📊 Session upload/download totals, latency and connection duration.
- 🪟 Tray menu, single-instance behavior and orderly disconnect on Quit.
- 🧰 A native Windows Job Object guardian closes the engine when its parent exits.
- 📦 Reproducible build instructions, versioned commits and a Windows release workflow.

### 🛠️ Build from source

Requirements: **Windows 10/11 x64**, **Node.js 24+**, npm, Git and **Visual Studio Build Tools with Desktop development with C++**. Use a **Developer Command Prompt for VS** so `cl.exe` is on PATH. Internet is needed to obtain dependencies and the pinned upstream engine during the build; the installed UI loads its assets locally.

```powershell
git clone https://github.com/Mr-Saman/azadi-connect.git
cd azadi-connect
npm ci
npm test
npm run assets
npm run build:guardian
npm run check:engine
npm start
```

To create the installable Windows EXE:

```powershell
npm run build:win
```

Output: `dist/Azadi-Connect-0.1.0-Windows-x64-Setup.exe`.

The download script pins **sing-box 1.14.3** and its official archive SHA-256. It never silently selects “latest.” The native guardian is compiled from the included C source, then its hash is recorded. The application rechecks both binaries before connecting. Installer branding, version information and the Administrator manifest are embedded with a JavaScript PE resource editor; Wine is not required for packaging on Linux.

For interface tests:

```powershell
npx playwright install chromium
npm run test:ui
```

### 🚀 Releases & development history

The Windows workflow runs on pushes/PRs, manually, and when a release is published. It runs unit tests, builds the native guardian, validates supported generated configurations, checks guardian lifecycle behavior, builds the installer and attaches artifacts. On a published `v0.1.0` release it uploads the EXE, SHA-256 list and pinned upstream source archive to that release. The tag must match `package.json`.

The initial implementation is developed in separate commits for the protocol core, desktop UI, validation, documentation and release packaging. Release binaries are generated from the checked-out commit, not committed into Git history.

---

## فارسی

![رابط فارسی آزادی کانکت](docs/screenshots/persian-dark.png)

*پیش‌نمایش رابط در حالت قطع اتصال؛ تصویر به معنای اتصال واقعی VPN نیست.*

### ✨ آزادی کانکت چیست؟

**آزادی کانکت** یک برنامهٔ دسکتاپ برای مدیریت پروفایل‌های VPN در ویندوز است. می‌توانی مشخص کنی کدام برنامه‌ها از مسیر VPN عبور کنند، یا با یک گزینه ترافیک تمام سیستم را به پروفایل انتخاب‌شده بسپاری. رابط فارسی راست‌چین با فونت **Vazir** و رابط انگلیسی چپ‌چین با فونت **Inter** ارائه شده؛ هر دو فونت داخل برنامه‌اند و وابستگی به CDN ندارند.

> 🤖 **این پروژه تماما توسط ChatGPT تولید شده است**؛ شامل کد برنامه، طراحی رابط، مستندات و اسکریپت‌های ساخت. موتور sing-box، Electron و فونت‌ها پروژه‌های مستقلِ سازندگان خود هستند و نام و مجوزشان در [فهرست وابستگی‌ها](THIRD_PARTY_NOTICES.md) آمده است.

### 🪟 روش نصب و استفاده

۱. از بخش **Releases** فایل `Azadi-Connect-0.1.0-Windows-x64-Setup.exe` را، پس از پیوست‌شدن به نسخه، دریافت کن.

۲. نصب‌کننده را اجرا کن؛ راه‌اندازی تونل به تأیید دسترسی Administrator ویندوز نیاز دارد.

۳. در برنامه روی **افزودن پروفایل** بزن. فایل `.conf`، `.ovpn` یا `.txt` را انتخاب کن یا لینک اتصال را بچسبان. برای OpenVPN دارای `auth-user-pass`، پیش از انتخاب فایل، نام کاربری و رمز را در بخش مربوط وارد کن.

۴. حالت **فقط برنامه‌های انتخاب‌شده** را انتخاب کن و فایل اجرایی واقعی برنامه‌ها را اضافه کن؛ یا حالت **تمام سیستم** را فعال کن.

۵. روی **اتصال** بزن. وضعیت متصل زمانی نمایش داده می‌شود که درخواست آزمایشی از خروجی VPN موفق باشد.

🔐 پروفایل‌ها با حساب فعلی ویندوز و DPAPI رمزگذاری می‌شوند. کانفیگ‌ها و کلیدهای واقعی وارد سورس، گیت‌هاب یا سرور دیگری نمی‌شوند. برنامه سرور رایگان یا حساب VPN ارائه نمی‌کند و به یک کانفیگ معتبر از ارائه‌دهندهٔ خودت نیاز دارد.

### 🧩 فرمت‌ها و قابلیت‌ها

| مورد | پشتیبانی این نسخه |
| --- | --- |
| WireGuard | فایل `.conf`، چند Peer، IPv4/IPv6، DNS، MTU، کلیدها و Keepalive |
| V2Ray | لینک‌های VMess جدید و VLESS؛ TCP، WebSocket، gRPC و HTTPUpgrade |
| Reality | لینک VLESS با تنظیمات Reality |
| Shadowsocks | لینک‌های `ss://`؛ بدون افزونهٔ اجرایی خارجی |
| Trojan، Hysteria2 و TUIC | لینک‌های اتصال متداول با تنظیمات پشتیبانی‌شده |
| OpenVPN | فایل `.ovpn` با TLS/TUN و گواهی‌های داخل فایل؛ نام کاربری/رمز اختیاری |
| SOCKS و HTTP(S) | به اندازهٔ قابلیت خروجی؛ HTTP ترافیک دلخواه UDP را پشتیبانی نمی‌کند |
| فهرست آفلاین | فایل متنی یا لینک‌های چندخطی و فهرست Base64 |
| ظاهر | تم روشن/تاریک، فارسی و انگلیسی، آیکون‌های اختصاصی و فونت محلی |
| مدیریت برنامه‌ها | انتخاب `.exe` و فهرست پردازش‌های در حال اجرا |
| وضعیت | مصرف جلسه، تأخیر آزمایش اتصال و مدت اتصال |

پشتیبانی یعنی مسیر ورود و ساخت کانفیگ پیاده‌سازی شده و با بررسی‌کنندهٔ موتور تطبیق داده شده است؛ تضمین سازگاری تمام سرورها نیست. **JSON/YAML خام، اشتراک آنلاین، XHTTP، افزونه‌های Shadowsocks، OpenVPN نوع TAP یا MFA، کلید خصوصی OpenVPN رمزدار، فایل‌های جانبی، اسکریپت و پلاگین و همهٔ پسوندهای اختصاصی VPN پشتیبانی نمی‌شوند.**

### 🎛️ تفاوت دو حالت اتصال

- **فقط برنامه‌های انتخاب‌شده:** مسیر دقیق فایل اجرایی مبنای قانون است. برنامه‌های دیگر مستقیم متصل می‌شوند. برای برنامه‌های چندپردازشی، فایل‌های کمکی مرتبط را هم اضافه کن و اتصال‌های قبلی را ببند و دوباره باز کن.
- **تمام سیستم:** خروجی پیش‌فرض ترافیک گرفته‌شده توسط تونل، VPN است. محدودهٔ `AllowedIPs` در فایل WireGuard حفظ می‌شود؛ پروفایل مخصوص شبکهٔ داخلی با این گزینه به VPN کامل اینترنت تبدیل نمی‌شود.

**سیاست DNS:** هنگام اتصال، DNS معمولی سیستم حتی در حالت انتخاب برنامه‌ها از VPN می‌گذرد. یافتن اولیهٔ آدرس سرور از DNS مستقیم `1.1.1.1` استفاده می‌کند. سپس اولین DNS عددی WireGuard یا Cloudflare DNS-over-TLS از داخل VPN به کار می‌رود. DoH داخلی هر برنامه تابع مسیر همان برنامه است.

**محدودیت مهم نسخهٔ اولیه:** Kill Switch پیاده‌سازی نشده است. با توقف یا کرش برنامه یا موتور، اینترنت مستقیم می‌تواند برقرار شود. محافظ فرایند ویندوز برای جمع‌کردن موتور است و جای فایروال را نمی‌گیرد. برای جلوگیری قطعی از نشت ترافیک به این نسخه اتکا نکن. مسیریابی برنامه‌ها هم مرز امنیتی قطعی نیست.

### 🛠️ راه‌اندازی سورس

پیش‌نیازها: ویندوز ۱۰ یا ۱۱ نسخهٔ ۶۴ بیتی، **Node.js 24 یا جدیدتر**، npm، Git و ابزار **Visual Studio Build Tools با قابلیت Desktop development with C++**. دستورها را در Developer Command Prompt اجرا کن تا `cl.exe` قابل دسترسی باشد.

```powershell
git clone https://github.com/Mr-Saman/azadi-connect.git
cd azadi-connect
npm ci
npm test
npm run assets
npm run build:guardian
npm run check:engine
npm start
```

ساخت نصب‌کننده:

```powershell
npm run build:win
```

خروجی در پوشهٔ `dist` قرار می‌گیرد. اینترنت برای دریافت وابستگی‌ها در زمان ساخت لازم است؛ فایل‌های رابط در نسخهٔ نصب‌شده محلی‌اند. موتور روی نسخهٔ مشخص **1.14.3** و SHA-256 مشخص قفل شده است.

### 📌 وضعیت انتشار و مشارکت

این نسخه **Preview و بدون امضای تجاری کد** است؛ ویندوز ممکن است ناشر را ناشناخته نمایش دهد. آزمون واقعی مسیریابی، DNS، قطع اتصال و سرورهای مختلف روی ویندوز همچنان لازم است و ادعای ممیزی امنیتی مستقل وجود ندارد. گزارش اعتبارسنجی در [VALIDATION.md](docs/VALIDATION.md) آمده است.

مراحل توسعه در commitهای مجزا ثبت می‌شوند. ساخت خودکار ویندوز، فایل نصب و فهرست SHA-256 را به Release متناظر متصل می‌کند. برای مشارکت، راهنمای [CONTRIBUTING.md](CONTRIBUTING.md) را ببین؛ کانفیگ واقعی یا کلید خصوصی را در Issue یا Pull Request نفرست.

---

<div align="center">

**برای ایران ❤️ · For Iran ❤️**

Built with ChatGPT. Shared as open source. 🌱

</div>
