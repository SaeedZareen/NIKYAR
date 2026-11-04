# نیک‌یار

**سامانه‌ی یکپارچه‌ی مدیریت فرایندهای سازمانی (BPMS)، با ساختار ماژولار و قابل توسعه به ERP**

- طراحی فرایند با استاندارد بین‌المللی **BPMN 2.0** و رابط کاملاً فارسی
- کارتابل اداری: دریافت کار، تکمیل فرم، ارجاع، یادداشت، سوابق پرونده
- انتساب کار بر اساس **چارت سازمانی**: شروع‌کننده، مدیر مستقیم، سمت، واحد، نقش
- تاریخ شمسی، اعداد فارسی، راست‌به‌چپ
- **نسخه‌بندی فرایند**: تغییر یک فرایند، درخواست‌های در جریان را خراب نمی‌کند
- سیستم **ماژول و لایسنس** برای فروش ماژول‌به‌ماژول
- نصب روی سرور خود سازمان (On-Premise) با Docker و بدون هیچ وابستگی به سرویس خارجی

---

## نصب روی ویندوز (ساده‌ترین روش)

1. **Git**، **Python 3.12+** و **Node.js LTS** را نصب کنید.
   هنگام نصب Python، تیک گزینه‌ی «Add python.exe to PATH» را بزنید.
2. ریپو را دانلود کنید (مثلاً در `C:\xampp\htdocs\NIKYAR`).
3. روی فایل `install-windows.bat` دابل‌کلیک کنید (فقط یک بار).
4. برای اجرا، روی `start-windows.bat` دابل‌کلیک کنید. مرورگر خودکار روی `http://localhost:8000` باز می‌شود.

## اجرای سریع برای توسعه

پیش‌نیاز: Python 3.12 یا بالاتر، Node.js 20 یا بالاتر

**ترمینال ۱ (بک‌اند):**
```bash
cd backend
python3 -m venv ../.venv && source ../.venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

**ترمینال ۲ (فرانت‌اند):**
```bash
cd frontend
npm install
npm run dev
```

سپس آدرس `http://localhost:5173` را باز کنید.

| کاربر نمایشی | نقش | رمز |
|---|---|---|
| `admin` | مدیر سامانه (طراحی فرایند، کاربران) | `nikyar123` |
| `developer` | کارشناس نرم‌افزار (کارمند) | `nikyar123` |
| `it_manager` | مدیر فناوری اطلاعات (مدیرِ developer) | `nikyar123` |
| `hr_expert` | کارشناس امور اداری | `nikyar123` |
| `hr_manager`، `ceo`، `fin_manager`، `accountant` | سایر سمت‌ها | `nikyar123` |

**سناریوی نمایشی:** با `developer` یک «درخواست مرخصی» ثبت کنید، با `it_manager` موافقت کنید و
با `hr_expert` آن را ثبت نهایی کنید. سپس در «پیگیری درخواست‌ها» نقشه‌ی فرایند و سوابق پرونده را ببینید.

## نصب روی سرور سازمان (Production)

```bash
cp .env.example .env
```
رمزها را در فایل `.env` تغییر دهید. سپس:
```bash
docker compose up -d --build
```
```bash
docker compose exec app python manage.py createsuperuser
```
سامانه روی پورت `8080` در دسترس است.

**لایسنس:** فایل `license/license.json` را بر اساس `license/license.example.json` بسازید.
بدون این فایل، سامانه در حالت «نسخه‌ی آزمایشی» با همه‌ی ماژول‌ها اجرا می‌شود.

## اجرای آزمون‌ها
```bash
cd backend && python manage.py test apps
```

## مستندات بیشتر
- [معماری و ساختار کد](docs/ARCHITECTURE.md)
- [راهنمای طراحی فرایند](docs/PROCESS-DESIGN.md)
- [نقشه‌ی راه](docs/ROADMAP.md)
