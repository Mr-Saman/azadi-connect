# 🛡️ Kill Switch · قفل شبکه

## فارسی

در تنظیمات، **کیل سوییچ — قفل شبکه** را روشن و سپس متصل شو. روشن‌کردن گزینه به‌تنهایی اینترنت را مسدود نمی‌کند. پس از بررسی کانفیگ و پیش از اجرای موتور، قفل فعال می‌شود. نبود این قابلیت در نسخهٔ قبلی، دلیل توقف موتور نبود.

| وضعیت | رفتار |
| --- | --- |
| گزینه خاموش | محافظت WFP فعال نمی‌شود؛ پس از توقف موتور اتصال مستقیم ممکن است برگردد |
| فقط برنامه‌ها | مسیر مستقیم همان فایل‌های اجرایی منتخب مسدود می‌شود؛ فایل‌های کمکی باید جداگانه انتخاب شوند |
| تمام سیستم | ارتباط مستقیم برنامه‌ها مسدود می‌شود؛ موتور برای ساخت مسیر VPN استثنا است |
| قطع VPN، خطا، خروج یا کرش | قفل باقی می‌ماند؛ اتصال مجدد را امتحان کن یا اینترنت مستقیم را بازیابی کن |
| بازیابی اینترنت مستقیم | VPN متوقف و فقط فیلترهای متعلق به آزادی کانکت پاک می‌شوند |
| حذف برنامه | ابتدا قفل آزاد می‌شود؛ اگر آزاد نشود حذف فایل‌ها متوقف می‌شود |

**بازیابی:** دکمهٔ بالای برنامه، گزینهٔ منوی کنار ساعت، یا **Start → Azadi Connect → Restore Internet**. میانبر Start حتی اگر گاوصندوق پروفایل‌ها باز نشود قابل استفاده است و دسترسی Administrator می‌خواهد. فرمان معادل در مسیر نصب:

```powershell
& 'C:\Program Files\Azadi Connect\Azadi Connect.exe' --restore-network
```

برای تغییر پروفایل، فهرست برنامه‌ها یا حالت اتصال، ابتدا VPN و قفل را آزاد کن. پس از قفل‌شدن، گزینهٔ خروج آن را حفظ می‌کند.

**محدوده:** فیلترهای پایدار Windows Filtering Platform برای IPv4/IPv6 استفاده می‌شوند. Loopback، موتور همراه برنامه، رابط واقعی تونل و ارتباط ضروری DHCP/کشف همسایهٔ IPv6 استثنا هستند. در حالت برنامه‌ها پورت‌های DNS معمولی ۵۳ و ۸۵۳ برای کل سیستم محافظت می‌شوند؛ با قطع VPN، نام‌گشایی برنامه‌های دیگر هم ممکن است تا بازیابی متوقف شود. DoH داخل برنامهٔ انتخاب‌نشده در محدودهٔ محافظت آن برنامه نیست.

این قابلیت در برابر مدیر محلی، خرابی کرنل، خاموش‌شدن سرویس BFE یا زمان ابتدای بوت پیش از بارگذاری سیاست تضمین نمی‌دهد. اتصال UDP/IPv6، برنامه‌های چندپردازشی، اتصال‌های قبلی، خواب/بیداری و تداخل با فایروال‌های دیگر به آزمون دستگاه واقعی نیاز دارند. نسخهٔ اولیه را محصول ممیزی‌شده یا تضمین ناشناس‌ماندن معرفی نمی‌کنیم.

## English

Enable **Kill Switch — network lock** in Settings, then connect. The preference alone does not install filters. The lock arms after configuration validation and before core startup, then refreshes atomically with the real TUN interface. The previous missing-Kill-Switch warning never prevented connection.

| State | Behavior |
| --- | --- |
| Off | No WFP protection; direct access may resume when the core stops |
| Selected apps | Direct connections by the exact selected executables are blocked; select helpers separately |
| Entire system | Direct application traffic is blocked; the bundled engine transports the VPN |
| Disconnect, error, quit or crash | Protection remains until reconnect or explicit recovery |
| Restore direct Internet | Stops VPN and removes only Azadi Connect filters |
| Uninstall | Releases the lock first; preserves files if recovery fails |

Recover using the in-app button, tray action or **Start → Azadi Connect → Restore Internet**. The Start shortcut runs before vault initialization and requests Administrator access. Release the lock before editing its scope.

The persistent IPv4/IPv6 ALE policy permits loopback, the bundled engine, the actual TUN LUID, narrowly scoped DHCP and essential IPv6 neighbor discovery. App mode also blocks ordinary DNS ports 53/853 globally outside the tunnel; unselected applications may lose DNS while the VPN is down. DoH in an unselected process is outside the selected-app scope.

No guarantee is made against an administrator, compromised kernel, disabled BFE, early boot before BFE loads policy, an unselected local relay, or privileged third-party interception. Manual tests are still required for existing flows, UDP, IPv6, new adapters, sleep/resume and other firewalls. See [VALIDATION.md](VALIDATION.md).
