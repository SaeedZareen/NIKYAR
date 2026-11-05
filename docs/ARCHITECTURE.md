# معماری

## نمای کلی

- **سرور**: Django 5.2 (LTS) + Django REST Framework؛ سند API خودکار با drf-spectacular در `/api/docs/`.
- **رابط کاربری**: React 19 + TypeScript + Vite + Tailwind CSS 4 + **shadcn/ui** (حالت راست‌به‌چپ، سبک فشرده‌ی Mira، پایه‌ی Radix).
- **اجرا**: در نصب سازمانی، `backend/serve.py` (Waitress) هم API و هم رابط ساخته‌شده (`frontend/dist`) را از یک درگاه روی همه‌ی کارت‌های شبکه سرو می‌کند؛ هر نشانی غیر از `/api/` به `index.html` برمی‌گردد.
- **داده‌ی هر نصب** در `backend/data/` (پایگاه SQLite، کلید امنیتی، فایل‌ها). PostgreSQL با متغیرهای `NIKYAR_DB_*` (راهنما در `backend/config/settings.py`).

## سرور (`backend`)

| مسیر | محتوا |
|---|---|
| `core/kernel/` | پایه‌ی API: `BusinessError` و قالب یکسان خطا `{detail, fields, code}`، مجوز `HasPerm` با نقشه‌ی `perms` روی هر نما، صفحه‌بندی و فیلتر چندمقداری هماهنگ با جدول داده، مرتب‌سازی الفبای فارسی، فیلد تاریخ شمسی، ثبت مجوزها و فهرست‌های پایه‌ی هر برنامه (`registry.py`)، `seed_demo` |
| `core/accounts/` | کاربر (جنسیت برای «آقای/خانم»، موبایل، نقش‌ها)، نقش (مجموعه‌ی کد مجوز)، نشست با CSRF و سقف تلاش ورود |
| `core/org/` | واحد سازمانی درختی، سمت (یک مدیر فعال در هر واحد)، انتصاب در بازه‌ی [شروع، پایان) |
| `core/audit/` | سابقه‌ی خودکار هر نوشتن در سطح فیلد (`AuditedModelViewSet`) و ورود/خروج |
| `core/lookups/` | فهرست‌های پایه: سیستمی (اعلام در کد، همگام پس از migrate، قفل) و قابل ویرایش |
| `core/settings/` | چارچوب تنظیمات: ذخیره‌ی مقدار هر بخش، API خواندن/ذخیره‌ی هر بخش، ثبت تغییر در سوابق |

- هر برنامه مجوزها (`nikyar_permissions`)، فهرست‌های پایه (`nikyar_lookups`) و بخش‌های تنظیمات (`nikyar_settings`) را روی AppConfig اعلام می‌کند؛ هسته هرگز به ماژول‌ها وابسته نیست.

### تنظیمات

```python
# apps.py
nikyar_settings = [SettingsSection(code="org-profile", title="مشخصات سازمان", serializer="core.org.sections.OrgProfileSettings")]
# هر فیلد سریالایزر برچسب فارسی و default دارد؛ اعتبارسنجی با validate_<field>.
# API: GET/PUT /api/settings/org-profile/ (مجوز settings.manage) — خواندن در کد: core.settings.service.read("org-profile")
```

در رابط کاربری، فرم هر بخش در `pages/admin/settings/` ساخته و در `SECTION_FORMS` صفحه‌ی تنظیمات ثبت می‌شود (قاب مشترک: `SettingsForm`). نام سازمان بدون ورود از `/api/org/branding/` خوانده می‌شود (`useBranding`).
- نوع‌های TypeScript رابط کاربری از سند OpenAPI سرور ساخته می‌شوند: `cd frontend && npm run api:types` (پس از هر تغییر API).

## رابط کاربری (`frontend/src`)

| مسیر | محتوا |
|---|---|
| `components/ui/` | اجزای shadcn — فقط با `npx shadcn@latest add <name>` اضافه می‌شوند؛ تغییرها حداقلی و توضیح‌دار (ترجمه‌ی متن‌ها، `containerClassName` جدول) |
| `components/data-table/` | جدول داده‌ی کامل روی TanStack Table v9 |
| `components/form/` | فرم استاندارد (`useAppForm`)، `FormField`، فیلدهای ایرانی، `ErrorSummary` |
| `components/layout/` | پوسته: نوار بالا، منوی کناری، زبانه‌های صفحه، جست‌وجوی سراسری، `PageHeader`، `Section` (جعبه‌ی گروه یکسان همه‌ی صفحه‌ها)، `SectionNav` (فهرست بخش‌ها در ستون کناری) |
| `components/jalali-calendar.tsx` | تقویم شمسی آوان (تعطیلات رسمی، شنبه اول هفته)؛ رنگ‌ها از توکن‌ها |
| `lib/format.ts` | ارقام فارسی، مبلغ، تاریخ شمسی (date-fns-jalali) |
| `lib/validators.ts` | کد ملی، موبایل، شبا، کارت، کد پستی + طرح‌های zod با پیام فارسی |
| `lib/api/` | کارخواه API با نوع‌های خودکار (`schema.d.ts`)، `unwrap` و `ApiError` با پیام فارسی |
| `app/` | نشست و نگهبان ورود (`auth.tsx`)، مسیرها با نگهبان مجوز، منو با مجوز هر بخش، QueryClient |
| `components/form/` | علاوه بر فیلدها: `FormSheet` (پانل ویرایش)، `applyServerErrors` (خطای سرور روی فیلدها)، `UnsavedChangesGuard` (هشدار خروج با تغییر ذخیره‌نشده) |
| `pages/admin/` | کاربران، نقش‌ها، ساختار سازمانی، فهرست‌های پایه، سوابق تغییرات، تنظیمات |
| `pages/ui-kit/` | نمونه‌ی همه‌ی اجزا (فقط مدیر کل) |

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
