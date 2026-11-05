# معماری

## نمای کلی

- **سرور**: Django 5.2 (LTS) + Django REST Framework؛ سند API خودکار با drf-spectacular در `/api/docs/`.
- **رابط کاربری**: React 19 + TypeScript + Vite + Tailwind CSS 4 + **shadcn/ui** (حالت راست‌به‌چپ، سبک فشرده‌ی Mira، پایه‌ی Radix).
- **اجرا**: در نصب سازمانی، `backend/serve.py` (Waitress) هم API و هم رابط ساخته‌شده (`frontend/dist`) را از یک درگاه روی همه‌ی کارت‌های شبکه سرو می‌کند؛ هر نشانی غیر از `/api/` به `index.html` برمی‌گردد.
- **داده‌ی هر نصب** در `backend/data/` (پایگاه SQLite، کلید امنیتی، فایل‌ها). PostgreSQL با متغیرهای `NIKYAR_DB_*` (راهنما در `backend/config/settings.py`).

## رابط کاربری (`frontend/src`)

| مسیر | محتوا |
|---|---|
| `components/ui/` | اجزای shadcn — فقط با `npx shadcn@latest add <name>` اضافه می‌شوند؛ تغییرها حداقلی و توضیح‌دار (ترجمه‌ی متن‌ها، `containerClassName` جدول) |
| `components/data-table/` | جدول داده‌ی کامل روی TanStack Table v9 |
| `components/form/` | فرم استاندارد (`useAppForm`)، `FormField`، فیلدهای ایرانی، `ErrorSummary` |
| `components/layout/` | پوسته: نوار بالا، منوی کناری، زبانه‌های صفحه، جست‌وجوی سراسری، `PageHeader`، `Section` (جعبه‌ی گروه یکسان همه‌ی صفحه‌ها) |
| `components/jalali-calendar.tsx` | تقویم شمسی آوان (تعطیلات رسمی، شنبه اول هفته)؛ رنگ‌ها از توکن‌ها |
| `lib/format.ts` | ارقام فارسی، مبلغ، تاریخ شمسی (date-fns-jalali) |
| `lib/validators.ts` | کد ملی، موبایل، شبا، کارت، کد پستی + طرح‌های zod با پیام فارسی |
| `app/` | مسیرها، منو، حالت‌های عمومی مسیر |
| `pages/` | صفحه‌ها (فعلاً کیت رابط کاربری) |

### جدول داده

```tsx
const view = useTableView("employees", { defaultSort: "name" })       // نشانی صفحه + ترجیحات کاربر
const table = useDataTable({ view, columns, data, getRowId })          // سمت مرورگر
// سمت سرور: useQuery({ queryKey: ["employees", view.query], ... }) و rowCount={data.count}
<DataTable table={table} view={view} caption="…" rowHref={(r) => `/…/${r.id}`} exportFileName="…" />
```

- جست‌وجو، مرتب‌سازی، فیلترها و صفحه در **نشانی صفحه** می‌مانند (اشتراک‌پذیر، دکمه‌ی بازگشت).
- ستون‌های نمایان، عرض، سنجاق و تراکم **ترجیح هر کاربر** در حافظه‌ی مرورگر.
- `meta` هر ستون: `label` (نام فارسی)، `primary` (پیوند ردیف و عنوان کارت موبایل)، `wrap` (ستون متنی که فضای اضافه را می‌گیرد و شکسته می‌شود)، `filterOptions` (فیلتر چندانتخابی)، `align`، `exportValue`.
- جدول در عرض صفحه جا می‌شود و نوار پیمایش داخلی ندارد: ستون‌های کوتاه به اندازه‌ی محتوا، ستون‌های `wrap` بقیه‌ی عرض. عرض ثابت فقط برای ستون سنجاق‌شده یا ستونی که کاربر عرضش را تغییر داده.
- روی موبایل هر ردیف یک کارت است.

### فرم

`useAppForm(schema, defaults)` + `Section` + `FormGrid` (یک/دو/سه ستون بر اساس عرض واقعی بخش) + `FormField` (برچسب کنار فیلد با عرض ثابت ۸rem، بالای فیلد روی موبایل) + `ErrorSummary`. مقدار فیلدهای ایرانی همیشه یکسان‌سازی‌شده (ارقام لاتین) است. تاریخ: `JalaliDateInput` (تایپ مستقیم با جداکننده‌ی خودکار یا انتخاب از تقویم آوان) با مقدار رشته‌ی شمسی `1405/08/14` و اعتبارسنجی `schemas.jalaliDate`.

## قواعد

- همه‌ی متن‌های کاربر فارسی رسمی؛ ارقام نمایشی فارسی (`formatNumber`, `toFaDigits`)؛ تاریخ‌ها شمسی.
- فقط کلاس‌های منطقی Tailwind (`ms-`, `pe-`, `start-`, `text-start`).
- رنگ‌ها فقط از توکن‌های `index.css`؛ رنگ هرگز تنها حامل معنا نیست.
- کد مرده، تکراری یا یتیم نگه داشته نمی‌شود؛ هر وابستگی باید استفاده شود.
