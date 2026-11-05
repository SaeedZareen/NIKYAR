# معماری

## نمای کلی

- **سرور**: Django 5.2 (LTS) + Django REST Framework؛ سند API خودکار با drf-spectacular در `/api/docs/`.
- **رابط کاربری**: React 19 + TypeScript + Vite + Tailwind CSS 4 + **shadcn/ui** (حالت راست‌به‌چپ، سبک فشرده‌ی Mira، پایه‌ی Radix).
- **اجرا**: در نصب سازمانی، `backend/serve.py` (Waitress) هم API و هم رابط ساخته‌شده (`frontend/dist`) را از یک درگاه روی همه‌ی کارت‌های شبکه سرو می‌کند؛ هر نشانی غیر از `/api/` به `index.html` برمی‌گردد.
- **داده‌ی هر نصب** در `backend/data/` (پایگاه SQLite، کلید امنیتی، فایل‌ها). PostgreSQL با متغیرهای `NIKYAR_DB_*` (راهنما در `backend/config/settings.py`).

## رابط کاربری (`frontend/src`)

| مسیر | محتوا |
|---|---|
| `components/ui/` | اجزای shadcn — فقط با `npx shadcn@latest add <name>` اضافه می‌شوند؛ تغییرها حداقلی و توضیح‌دار (ترجمه‌ی متن‌ها، تقویم شمسی، `containerClassName` جدول) |
| `components/data-table/` | جدول داده‌ی کامل روی TanStack Table v9 |
| `components/form/` | فرم استاندارد (`useAppForm`)، `FormField`، فیلدهای ایرانی، `ErrorSummary` |
| `components/layout/` | پوسته: نوار بالا، منوی کناری، زبانه‌های صفحه، جست‌وجوی سراسری، `PageHeader` |
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
- `meta` هر ستون: `label` (نام فارسی)، `primary` (پیوند ردیف و عنوان کارت موبایل)، `filterOptions` (فیلتر چندانتخابی)، `align`، `exportValue`.
- روی موبایل هر ردیف یک کارت است.

### فرم

`useAppForm(schema, defaults)` + `FormField` (برچسب کنار فیلد روی صفحه‌ی بزرگ، بالای فیلد روی موبایل) + `ErrorSummary`. مقدار فیلدهای ایرانی همیشه یکسان‌سازی‌شده (ارقام لاتین) است؛ تاریخ‌ها رشته‌ی شمسی `1405/08/14`.

## قواعد

- همه‌ی متن‌های کاربر فارسی رسمی؛ ارقام نمایشی فارسی (`formatNumber`, `toFaDigits`)؛ تاریخ‌ها شمسی.
- فقط کلاس‌های منطقی Tailwind (`ms-`, `pe-`, `start-`, `text-start`).
- رنگ‌ها فقط از توکن‌های `index.css`؛ رنگ هرگز تنها حامل معنا نیست.
- کد مرده، تکراری یا یتیم نگه داشته نمی‌شود؛ هر وابستگی باید استفاده شود.
