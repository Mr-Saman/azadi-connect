# Azadi Connect for Android · آزادی کانکت

A native Kotlin / Jetpack Compose companion to the Windows app, with the same mint/violet palette, local Vazir/Inter fonts, English/LTR and Persian/RTL, and light/dark themes.

## Capabilities

- A mobile connection dashboard with real outbound verification, transfer totals, session duration and latency.
- Encrypted, device-local profiles using an AES-GCM key held in Android Keystore. Backups and device-to-device extraction are excluded.
- Text/file and offline batch import: WireGuard, VLESS/Reality, modern VMess, Shadowsocks, Trojan, Hysteria2, TUIC, TLS/TUN OpenVPN, SOCKS5 and HTTP(S).
- Full-device or selected-app VPN routing through Android's VpnService UID allowlist. No root and no separate VPN app required.
- A foreground notification with Disconnect, safe stop/revoke cleanup and network-interface monitoring.
- Session timers: 15/30/60/120 minutes, cancellation and elapsed-time countdown.
- Dismissible Snackbar messages and persistent, redacted diagnostics.
- An update center that checks the release URL, size, SHA-256, package identity, newer version code **and the installed signing certificate**. Android owns final installation consent.
- A link to Android's **Always-on VPN / Block connections without VPN** controls. A UI toggle cannot silently enable Android's system lock.

## Install and use

Requires **Android 8.0+ (API 26), arm64-v8a or x86_64**. This build does not support 32-bit phones.

1. Install **Azadi-Connect-1.0.0-Android-debug.apk** from your development build or the Android workflow artifact.
2. Add your own profile through Profiles → Add. Enter OpenVPN credentials before choosing a file if required.
3. Choose Entire device or select applications under Apps. The picker lists launchable applications visible to Android; unrestricted package visibility is not requested.
4. Tap Connect and accept Android's VPN consent. **Verified** appears only after a request through the VPN outbound succeeds.
5. Set a disconnect timer in Settings if desired.
6. For persistent blocking, open Android VPN settings and explicitly enable Always-on VPN and Block connections without VPN.

There are no bundled VPN accounts. Actual provider compatibility and reliability on your device still need testing.

### Timer and Kill Switch behavior

The deadline uses monotonic elapsed time, so clock changes do not extend a session. The service checks it and schedules an Android idle-aware alarm. Android may delay inexact alarms during Doze/battery saving; this is not a hard real-time timer.

Disconnecting or expiry stops the tunnel. Android system lockdown remains active until **you** disable it in VPN settings. DNS behavior under lockdown, excluded applications and OEM battery policies are controlled by Android; they are not identical to Windows WFP protection.

### Updates and signing

The APK included here is **debug signed for testing**, not a production-signed Android release. CI debug keys may differ between runs; the updater deliberately rejects mismatched signers. Keep the same signing key for upgrades.

For a public Android release, use a securely stored, persistent release keystore, bump versionCode/versionName, attach **Azadi-Connect-VERSION-Android.apk** to the matching stable GitHub Release, and add its SHA-256 to **SHA256SUMS.txt**. Never commit a keystore or put passwords in chat, scripts or source.

The update center shares this repository's latest stable release API. A newer Windows-only release is reported as having no Android APK. There is no silent installation or downloaded executable code outside Android's package installer.

## Reproducible build

Prerequisites: **JDK 21**, **Go 1.25.5**, **Android SDK 35**, **Build Tools 35.0.0**, **NDK 28.1.13356709**. Android Studio can install SDK components. The checked-in wrapper pins Gradle 8.13 and its SHA-256.

~~~bash
export ANDROID_HOME=/path/to/Android/Sdk
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/28.1.13356709"
# Set JAVA_HOME and put the Go compiler on PATH.
android/scripts/build-core.sh
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
~~~

Output: **android/app/build/outputs/apk/debug/app-debug.apk**.

The core script pins **sing-box 1.14.3** to commit **7054cac5124465ffdb145870d7c01885566711b1**, retains Go module checksum verification and builds the mobile bridge from source. It includes gVisor, QUIC, WireGuard, uTLS, Clash API and OpenVPN. The upstream Android linker compatibility flag is retained. The AAR and SDK/build caches are generated, not checked into Git.

Behind an HTTPS proxy, configure Java/Gradle proxy properties and trust the organization's CA through a task-local truststore. Keep TLS, Gradle checksum and Go module verification enabled.

The Android workflow builds the same library, runs tests/lint and uploads a debug APK plus checksum. It does not publish an Android production release.

## Tests and practical limits

Unit tests cover import validation/rejection, preserved WireGuard AllowedIPs, generated routing/DNS, TLS requirements, credential redaction, deadlines and update version/checksum rules. Lint remains enabled; one foreground-service check is scoped out for the documented VPN exemption that does not require exact-alarm permission.

Network handover, sleep/Doze, app routing, Always-on lockdown, real providers and APK upgrades must also be exercised on physical devices. A successful build is not proof of those behaviors across OEMs.

Shared public bootstrap DNS uses **1.1.1.1** directly to resolve the VPN server. Captured application DNS uses profile DNS, where supplied, or DNS-over-TLS through the VPN. WireGuard AllowedIPs are preserved; full-device mode cannot turn a private-only server into a full Internet VPN. Plain SOCKS/HTTP upstreams may not encrypt traffic.

## Licenses and source

GPL-3.0-or-later. Bundled third-party licenses are included in APK assets **licenses/**. The engine's exact source is at <https://github.com/SagerNet/sing-box/tree/v1.14.3>. Build flags and all Android application source are in this repository. Fonts retain their original licenses.

---

## راهنمای فارسی

اپ اندروید بومی است و موتور اتصال داخل APK قرار دارد. رابط فارسی/انگلیسی، تم روشن/تاریک، انتخاب برنامه‌ها، ورود پروفایل، تایمر، پیام‌های شناور و مرکز آپدیت دارد.

نیازمندی: **اندروید ۸ یا جدیدتر، پردازندهٔ ۶۴ بیتی**. فایل **Android-debug.apk** برای آزمایش است؛ انتشار عمومی و آپدیت‌های قابل نصب، به کلید امضای ثابت و امن نیاز دارند.

پروفایل‌ها با Android Keystore رمزگذاری می‌شوند و به گیت‌هاب ارسال نمی‌شوند. اتصال فقط پس از موفقیت درخواست واقعی از VPN تأیید می‌شود.

قفل پایدار را خودت در تنظیمات VPN اندروید با «VPN همیشه روشن» و «مسدودکردن اتصال بدون VPN» فعال کن. تایمر و قطع اتصال این قفل را خاموش نمی‌کنند. اندروید ممکن است اجرای تایمر را در حالت ذخیرهٔ باتری به تأخیر بیندازد.

آزمون روی گوشی واقعی، تعویض Wi-Fi/دیتا، حالت خواب، قفل شبکه و سازگاری سرور همچنان ضروری است. APK آزمایشی، تأیید انتشار نهایی برای همهٔ دستگاه‌ها محسوب نمی‌شود.
