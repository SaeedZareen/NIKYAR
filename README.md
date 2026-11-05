# نیک‌یار

سامانه‌ی یکپارچه‌ی مدیریت فرایند (BPMS) و منابع سازمانی، ماژولار و کاملاً فارسی، برای نصب روی سرور خود سازمان.

وضعیت: **فاز ۱ — هسته‌ی رابط کاربری** (نقشه‌ی راه: [docs/ROADMAP.md](docs/ROADMAP.md))

## نصب روی ویندوز

پیش‌نیازها (یک‌بار):

- [Python 3.12 یا جدیدتر](https://www.python.org/downloads/) — هنگام نصب گزینه‌ی «Add python.exe to PATH» را بزنید.
- [Node.js 22 LTS یا جدیدتر](https://nodejs.org/)
- [Git](https://git-scm.com/download/win)

سپس در پوشه‌ی پروژه:

1. `install.bat` را اجرا کنید (نصب بسته‌ها، ساخت رابط کاربری، آماده‌سازی پایگاه داده).
2. `start.bat` را اجرا کنید. نشانی‌های ورود در پنجره نمایش داده می‌شود؛ پنجره را تا پایان کار باز نگه دارید.

## به‌روزرسانی

`update.bat` را اجرا کنید (آخرین نسخه را می‌گیرد و نصب را تکرار می‌کند)، سپس `start.bat`.
داده‌های شما در پوشه‌ی `backend/data` می‌ماند و پاک نمی‌شود.

## استفاده از رایانه‌ها و موبایل‌های دیگر (شبکه‌ی محلی)

لپ‌تاپ شما سرور می‌شود و هر دستگاهی که به **همان شبکه (همان مودم یا وای‌فای)** وصل است می‌تواند وارد شود:

1. `start.bat` را اجرا کنید. در پنجره خطی مثل `From other devices (LAN): http://192.168.1.20:8000` می‌بینید.
2. همان نشانی را در مرورگر رایانه یا موبایل دیگر باز کنید.
3. اگر باز نشد، دیوار آتش ویندوز مانع است: بار اول ویندوز می‌پرسد، «Allow» را بزنید؛ یا یک‌بار `allow-network.bat` را با راست‌کلیک و «Run as administrator» اجرا کنید.
4. شبکه‌ی وای‌فای ویندوز باید «Private» باشد، نه «Public» (Settings ← Network ← Wi-Fi ← Network profile type).

## برای توسعه

```bash
python -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt
cd frontend && npm ci
```

| کار | فرمان |
|---|---|
| اجرای سرور API | `cd backend && ../.venv/bin/python manage.py runserver` |
| اجرای رابط کاربری (با بارگذاری خودکار) | `cd frontend && npm run dev` |
| آزمون‌های سرور | `cd backend && ../.venv/bin/python -m pytest` |
| آزمون واحد رابط کاربری | `cd frontend && npm test` |
| آزمون مرورگر (لپ‌تاپ، مانیتور بزرگ، موبایل) | `cd frontend && npm run e2e` |
| بررسی نوع‌ها و کیفیت کد | `cd frontend && npm run typecheck && npm run lint` |

ساختار و اصول فنی: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
