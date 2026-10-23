# Contributing · مشارکت 🌱

1. Fork the repository and create a focused branch.
2. Use Node.js 24+, install with `npm ci` and run `npm test`.
3. For import/routing changes, run `npm run assets`, build the guardian and run `npm run check:engine` on Windows.
4. For UI changes, install Playwright Chromium and run `npm run test:ui`. Check both directions and themes.
5. Keep Persian/English translation keys in parity and fonts/assets local.
6. Use meaningful commits (`feat:`, `fix:`, `docs:`, `test:`). Explain behavior, tests and limitations in the pull request.
7. Do not commit real profiles, secrets, traffic logs, node_modules or installer binaries.

New formats must reject unsupported security-sensitive options. Never add `insecure: true`, executable configuration hooks or a direct fallback for selected VPN traffic as a convenience. Do not advertise compatibility before a parser and an engine validation case exist. Use dedicated test servers for live interoperability checks.

برای مشارکت، تغییرها را کوچک و مشخص نگه دار؛ آزمون‌ها را اجرا کن و رابط را به هر دو زبان بررسی کن. تنظیمات واقعی VPN یا اطلاعات محرمانه را داخل مخزن قرار نده. ادعای قابلیت باید با پیاده‌سازی و آزمون پشتیبانی شود.
