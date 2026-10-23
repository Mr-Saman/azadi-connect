# ✍️ Windows code signing · امضای معتبر ویندوز

Status: **unsigned preview**. Checked against official documentation on **2026-10-23**.

## فارسی

امضای کد، نام تأییدشدهٔ ناشر و دست‌نخوردن فایل را قابل بررسی می‌کند. این همان مجوز Administrator نیست؛ خطای اتصال VPN را هم رفع نمی‌کند.

**مسیر دریافت**

1. اگر واجد شرایط هستی، در Azure سرویس **Artifact Signing** بساز، احراز هویت شخص/سازمان را کامل کن و پروفایل **Public Trust** بگیر.
2. در غیر این صورت، از صادرکنندهٔ معتبر گواهی کد، شرایط صدور به کشور و نوع هویت قانونی خودت را بپرس؛ سپس احراز هویت و تهیهٔ گواهی مناسب را انجام بده. گواهی رایگان Self-signed برای اعتماد عمومی ویندوز کافی نیست.
3. کلید امضا را در سرویس ابری/HSM یا توکن مناسب نگه دار؛ گواهی، کلید و رمز را در Git یا فایل‌های پروژه قرار نده.
4. فایل‌های نهایی را در فرایند انتشار با SHA-256 و timestamp معتبر امضا و با SignTool بررسی کن. نسخهٔ امضاشده را دوباره هش بگیر و پس از امضا فایل را تغییر نده.

طبق راهنمای فعلی Artifact Signing، حساب شخصی Public Trust فقط برای افراد ساکن آمریکا یا کانادا است. سازمان‌ها در کشورهای بیشتری از جمله اتحادیهٔ اروپا پذیرفته می‌شوند؛ ایران در فهرست فعلی نیست. صرف تغییر منطقهٔ Azure، جای احراز هویت واجد شرایط را نمی‌گیرد. شرایط نهایی را قبل از پرداخت از ارائه‌دهنده بگیر.

**مزایا:** نمایش ناشر تأییدشده، تشخیص تغییر فایل و امکان شکل‌گرفتن اعتبار ناشر در نسخه‌های متوالی. امضا به معنی ممیزی امنیتی نیست. حتی EV هم حذف فوری هشدار SmartScreen را تضمین نمی‌کند؛ خرید EV فقط برای حذف هشدار، مبنای مناسبی ندارد.

## English

Code signing binds a verified publisher identity to the final file and makes modification detectable. It neither grants Administrator access nor fixes a VPN handshake.

Use Microsoft **Artifact Signing Public Trust** if eligible: create the account, complete identity validation and create a certificate profile. Otherwise, confirm your legal identity/country eligibility with a trusted code-signing CA before purchasing an appropriate certificate. Self-signed certificates do not establish public Windows trust. OV private keys require hardware-backed storage such as a supported token or cloud HSM.

Microsoft currently limits individual Public Trust enrollment to the US/Canada. Organizations have broader availability, including the EU; consult the current eligibility list. Iran is not listed. Do not assume eligibility from the Azure resource location.

Sign every release with a consistent identity, SHA-256 and a trusted timestamp; verify the signatures before publishing. Publisher reputation can grow, but a new signed file may still trigger SmartScreen. EV no longer grants an instant warning bypass.

## Build integration work needed

The repository does **not** contain a signing identity or an enabled paid signing service. Before converting this preview to a signed distribution:

- Configure the chosen provider with narrowly scoped CI credentials; prefer short-lived workload identity where supported.
- Sign native helpers and any unsigned redistributed PE files before recording their final integrity hashes.
- Apply Electron branding/manifest changes before signing the final app; sign the installer after packaging.
- Change the custom NSIS uninstaller flow to package a prebuilt, signed uninstaller. It currently creates the uninstaller during installation.
- Re-run package integrity checks, verify Authenticode signatures, then generate release checksums.

با تهیهٔ گواهی، فرایند فعلی ساخت باید برای امضای فایل‌های بومی، برنامه، نصاب و uninstaller نیز تنظیم شود؛ این راهنما به‌معنای فعال‌بودن امضا در نسخهٔ منتشرشده نیست.

```powershell
# Verify an already signed final artifact. No private key is needed here.
signtool verify /pa /all /v .\Azadi-Connect-0.2.0-Windows-x64-Setup.exe
```

## Official references

- [Artifact Signing setup and eligibility](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
- [Windows signing options, OV/EV and key storage](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool)
