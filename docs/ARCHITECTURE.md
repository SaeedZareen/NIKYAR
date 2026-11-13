# معماری

## نمای کلی

- **سرور:** Django 5.2 (LTS) + Django REST Framework؛ سند API خودکار با drf-spectacular در `/api/docs/`.
- **رابط کاربری:** React 19 + TypeScript + Vite + Tailwind CSS 4 + **shadcn/ui** (حالت راست‌به‌چپ، سبک فشرده‌ی Mira، پایه‌ی Radix).
- **اجرا:** در نصب سازمانی، `backend/serve.py` (Waitress) هم API و هم رابط ساخته‌شده (`frontend/dist`) را از یک درگاه روی همه‌ی کارت‌های شبکه سرو می‌کند و اجراکننده‌ی کارهای پس‌زمینه را در رشته‌ای جدا راه می‌اندازد؛ هر نشانی غیر از `/api/` به `index.html` برمی‌گردد.
- **داده‌ی هر نصب** در `backend/data/`: پایگاه SQLite، فایل‌ها (`media/`)، پشتیبان‌ها (`backups/`)، کلید امنیتی (`secret_key`) و شناسه‌ی نصب (`install_id`). PostgreSQL با متغیرهای `NIKYAR_DB_*` (راهنما در `backend/config/settings.py`؛ پشتیبان‌گیری درون سامانه برای PostgreSQL در 6.2).

---

## سرور (`backend`)

### برنامه‌های هسته (`core/`)

| برنامه | محتوا |
|---|---|
| `kernel/` | پایه‌ی API: `BusinessError` و قالب یکسان خطا `{detail, fields, code}`، مجوز `HasPerm` با نقشه‌ی `perms` (و اعمال لایسنس)، `LicenseBlocked`، صفحه‌بندی و فیلتر چندمقداری هماهنگ با جدول داده، مرتب‌سازی الفبای فارسی، `JalaliDateField`، اعتبارسنج‌های ایرانی (`validators.py`)، رمزگذاری مقدارهای محرمانه (`secrets.py`)، رجیستری اعلام‌ها (`registry.py`)، `seed_demo` |
| `settings/` | چارچوب تنظیمات: ذخیره‌ی مقدار هر بخش، API خواندن/ذخیره، ثبت تغییر در سوابق؛ بخش «سامانه و امنیت» (`sections.SystemSettings`، 5.4a): مدت اعتبار ورود (`set_expiry` هنگام ورود)، سقف تلاش ورود در دقیقه (`accounts.views.LoginThrottle`)، سقف ثبت نهایی فرم در دقیقه (`forms.acceptance`)، اعتبار پیوند تأیید سریع (`workflow.quick`) و نگه‌داری سابقه‌ی کارها (`jobs.service.keep_days`) |
| `accounts/` | کاربر (جنسیت برای «آقای/خانم»، موبایل، نقش‌ها، تصویر امضا)، نقش (مجموعه‌ی کد مجوز)، نشست با CSRF و سقف تلاش ورود، «حساب من» (`session/profile/`)، جست‌وجوی سبک کاربران برای انتخاب‌گرها (`user-lookup/` با `unit`، `role` و `ids`، برای هر کاربر واردشده)، نام نقش‌ها (`role-lookup/`)، سمت اصلی جاری در نشست (`assignment`)، `users_with_perm()` برای گیرندگان اعلان |
| `org/` | واحد سازمانی درختی (`service.subtree_ids`، `service.primary_assignment`؛ فهرست سبک `unit-lookup/` و `position-lookup/` برای هر کاربر واردشده)، سمت (یک مدیر فعال در هر واحد)، انتصاب در بازه‌ی [شروع، پایان)؛ بخش‌های تنظیمات «مشخصات سازمان» و «سال مالی» (`fiscal_year()`)؛ نام، لوگو و نسخه برای صفحه‌ی ورود (`branding/`، بدون ورود) |
| `audit/` | سابقه‌ی خودکار هر نوشتن در سطح فیلد (`AuditedModelViewSet`، `record()`) و ورود/خروج |
| `lookups/` | فهرست‌های پایه: سیستمی (اعلام در کد، همگام پس از migrate، قفل) و قابل ویرایش |
| `files/` | بارگذاری با بررسی محتوای واقعی (`types.py`، شامل تصویر، PDF، اسناد اداری و صدا: mp3، m4a، ogg، wav، webm؛ نام اصلی با نیم‌فاصله از فیلد `name` بازگردانده می‌شود)، مشخصات چند فایل با شناسه (`info/?ids=`)، رونوشت مستقل (`duplicate`)، دریافت فقط از `/api/files/<id>/download/` (عمومی فقط برای لوگو)، تصاحب/آزادسازی توسط رکورد صاحب (`FileRefField`)، پاک‌سازی روزانه‌ی فایل‌های بی‌استفاده (کار `files.cleanup`)، بخش تنظیمات «فایل‌ها و پیوست‌ها» |
| `workcalendar/` | بخش تنظیمات «روزها و ساعت کاری»، تعطیلات رسمی و خاص سازمان، داده‌ی تعطیلات رسمی همراه برنامه (`data/official_holidays.json` از بسته‌ی آوان، بارگذاری هر سال یک‌بار پس از migrate)، ورود از CSV، خدمت `WorkCalendar` (`is_working_day`، `add_working_hours`، `add_working_days`، `working_hours_between`) برای مهلت‌ها و گزارش عملکرد |
| `numbering/` | نوع‌های سند شماره‌دار، الگو با `{year}` `{yy}` `{fyear}` `{month}` `{seq:5}`، شروع دوباره (سال شمسی، سال مالی، هرگز)، صدور با `allocate("<code>")` در تراکنش و به‌روزرسانی اتمی، شماره‌ی بعدی فقط رو به جلو |
| `jobs/` | صف کار روی پایگاه داده (`Job`) با تلاش دوباره، زمان‌بند روزانه (`Daily`) و دوره‌ای (`Every(دقیقه)`)، `@task` در `tasks.py` هر برنامه، `enqueue()`؛ اجراکننده درون `serve.py` یا `manage.py run_worker`؛ کار نیمه‌کاره پس از راه‌اندازی دوباره به صف برمی‌گردد؛ کار ناموفق نهایی به دارندگان `jobs.manage` اعلان می‌دهد |
| `backup/` | پشتیبان کامل ZIP (manifest، کپی سازگار SQLite، فایل‌ها)، پشتیبان روزانه و حذف روزانه‌های قدیمی، بازیابی از فهرست یا فایل با بررسی نسخه، پشتیبان خودکار «پیش از بازیابی» و migrate پس از بازیابی |
| `notifications/` | نوع‌های اعلان، `notify(users, code, url=..., body=..., email_extra=..., **data)` پس از ثبت قطعی تراکنش (`body` متن آماده به‌جای قالب، `email_extra(user)` متن افزوده‌ی فقط ایمیل)، متن ذخیره‌شده هنگام ساخت، متن سفارشی سازمان (بخش «متن اعلان‌ها»)، API اعلان‌های کاربر؛ کانال‌های بیرونی هر نوع: اعلام در کد ← پیش‌فرض سازمان ← انتخاب هر کاربر (`NotificationPreference`) |
| `messaging/` | بخش تنظیمات «پیامک و ایمیل» (کلید و گذرواژه با `SecretField` رمزشده، هرگز برگردانده نمی‌شوند)، درگاه‌های پیامک افزونه‌ای (`providers.SMS_PROVIDERS`: کاوه‌نگار)، SMTP، ارسال از صف (`queue()`، کار `messaging.send`)، سابقه‌ی ارسال‌ها (`Delivery`)، ارسال آزمایشی بی‌درنگ |
| `delegation/` | جانشینی برای همه‌ی کارهای اصیل در بازه‌ی [از، تا] (هر دو سر شامل)، بدون هم‌پوشانی برای یک اصیل؛ هر کاربر برای خودش و دارنده‌ی `delegation.manage` برای همه؛ لغو: آینده حذف، جاری از امروز پایان؛ `delegates_of(user, process=…)` (جانشینی ویژه‌ی فرایند بر کامل مقدم) و `principals_of(user)` برای گردش کار |
| `licensing/` | فایل لایسنس امضاشده با Ed25519 (`signing.py`؛ کلید عمومی مالک در `owner_public_key.pem`)، شناسه‌ی نصب، دوره‌ی آزمایشی ۳۰ روزه (۵۰ کاربر)، سقف کاربر فعال (`check_user_capacity`)، فرمان مالک `license keygen/issue/show` (`license-tool.bat`؛ راهنما: `docs/LICENSE-GUIDE.md`) |
| `workflow/` | گردش کار (فاز ۴) روی SpiffWorkflow: فرایند (فرم اصلی، شروع‌کنندگان، مدیران، ثبت به نام دیگری، شماره‌گذاری)، نسخه (فایل BPMN؛ پیش‌نویس و منتشرشده با نسخه‌ی ثابت فرم)، درخواست (پیش‌نویس، داده، وضعیت موتور، پایان انتظار)، کار (گیرنده‌ها، برداشتن، سیاست گیرنده، مهلت، تصمیم)، نظر گیرنده (`TaskVote`)، گفت‌وگو (`RequestComment`)، پیوند ایمیل (`QuickAction`)، تاریخچه (`Event`)؛ ماژول‌ها: `bpmn.py` (بررسی و تجزیه)، `expressions.py` (`SafeScriptEngine` بی eval)، `assignment.py` (گیرنده‌ها)، `access.py` (دسترسی فیلدها در مرحله)، `service.py` (انتشار، ثبت و شروع، انجام کار، همگام‌سازی، زمان‌بندی)، `inbox.py` (کارتابل)، `deadlines.py` (مهلت و متن مرحله)، `discussion.py`، `quick.py`، `tracking.py` (پیگیری و لغو)، `manage.py` (مدیریت درخواست‌ها)، `performance.py` (گزارش عملکرد)، `actions.py` (اقدام‌های خودکار)، `placeholders.py`، `records.py` (منبع ارجاع) — بخش «گردش کار» پایین‌تر |
| `forms/` | فرم‌ساز (فاز ۳): فرم (شناسه‌ی لاتین پایدار، دسته از فهرست `form-category`، نقش‌های پرکننده و بیننده، شماره‌گذاری، پذیرش و محدودیت‌ها، کار پس از ثبت، اعلان‌ها، بی‌نام)، نسخه (پیش‌نویس ویرایش‌شدنی، منتشرشده تغییرناپذیر، یک پیش‌نویس در هر فرم)، ثبت (پیش‌نویس خصوصی ثبت‌کننده، ثبت نهایی بسته به نسخه‌ی خودش و ویرایش‌پذیر فقط در مهلت فرم)؛ کاتالوگ نوع فیلدها (`fieldtypes.py`)، موتور (`engine.py`)، قاعده‌ها (`rules.py`)، پاک‌سازی HTML (`html.py`)، پذیرش (`acceptance.py`)، ورود/خروج و الگوها (`transfer.py`، `templates/`)، دسترسی و فایل‌ها (`service.py`) — بخش «فرم‌ساز» پایین‌تر |

### ماژول‌ها (`modules/`)

ماژول قابل فروش یک برنامه‌ی Django در `backend/modules/<ماژول>` با `nikyar_module` است؛ هسته هیچ‌گاه آن را import نمی‌کند و ماژول فقط از راه اعلام‌های AppConfig (جدول پایین) به هسته وصل می‌شود. اگر ماژول در لایسنس نباشد، `HasPerm` API آن را با کد `module_disabled` می‌بندد و پرچم‌های نشستش false می‌شوند (منو پنهان).

- **`modules/hr`** («پرونده‌ی پرسنلی»، فاز ۵): پرونده‌ی کارمند (`Employee`: مشخصات، تماس، عکس، استخدام، واحد، پایان همکاری، اتصال یکی‌به‌یکی به کاربر)، کد پرسنلی با شمارنده‌ی `hr-personnel`، فهرست‌های پایه‌ی «نوع استخدام» و «علت پایان همکاری»، مجوزهای `hr.view` و `hr.manage`؛ `access.py` (مدیر واحد کارکنان واحد و زیرواحدهایش را فقط می‌بیند: واحد پرونده یا انتصاب جاری کاربر متصل)، `profile.py` (کد ملی برای پیش‌پر)، `demo.py`. **اطلاعات تکمیلی** (5.3): `Employee.extra` با فیلدهای دلخواه `hr-employee` (`custom-fields/` تعریف و طرح، `<id>/extra/` ذخیره)، ستون‌های جدول با `components/form-renderer/field-columns.tsx` (مشترک با جدول ثبت‌های فرم)؛ «پرونده‌ی من» (`me/`، پرچم نشست `hr_self`، صفحه‌ی `/hr/me` با همان `EmployeeView`؛ `access.readable` سوابق پرونده‌ی خود را هم می‌دهد). **سوابق** (5.2): `EmployeeRecord` انتزاعی و شش مدل `Education`، `WorkHistory`، `Dependent`، `BankAccount` (یک حساب حقوق در هر پرونده)، `Insurance`، `Document` (با `expired`)، هر کدام با فهرست پایه‌ی ماژول؛ یک `RecordViewSet` عمومی (`/api/hr/<نوع>/?employee=`؛ حساب بانکی و بیمه «مالی»اند و مدیر واحد آن‌ها را نمی‌بیند؛ حذف سابقه فایلش را آزاد می‌کند) و `FileFieldsMixin` برای فیلدهای فایل مدل. در رابط، `record-section.tsx` (جدول + پانل افزودن/ویرایش + حذف، تعریف‌شده با `RecordConfig`) و `record-kinds.tsx` (شش تعریف)؛ زبانه‌ی «بانک و بیمه» فقط با `can_view_financial`. API `/api/hr/employees/` (بی حذف؛ فهرست کامل برای جدول مرورگر). رابط: `pages/hr` (فهرست، صفحه‌ی پرونده با زبانه‌ها در `?tab=`، پانل ثبت و ویرایش). **مرخصی و تردد** (5.4b): `ready.py` هشت فرایند آماده (درخواست‌دهنده ← مدیر مستقیم ← جایگاه `hr.hr` ← اقدام `hr.record`)؛ `leave.py`: رویداد از داده‌ی فرم (`event_values`؛ روز کاری با `WorkCalendar`، مرخصی ساعتی به نسبت «مدت هر روز مرخصی»)، مانده (`balance`: سهمیه‌ی هر سال شمسی + انتقالی تا سقف − رویدادهای کسرشونده)، قاعده‌های پیش از ارسال (`check_request`، از تنظیمات اقدام `hr.record` نسخه‌ی منتشرشده)، و فهرست پایه‌ی سیستمی `leave-type` هم‌سان با جدول تنظیمات (`sync_lookup` پس از migrate و با `on_change` تنظیمات)؛ پارامترهای اقدام در `leave_params.py` (بی مدل، برای AppConfig)؛ مدل `EmployeeEvent` (یکی برای هر درخواست) و API فقط‌خواندنی `/api/hr/events/?employee=`؛ `leave_balance` در جزئیات پرونده؛ پیش‌پرهای تازه: کد پرسنلی، تاریخ و نوع استخدام، مانده‌ی مرخصی. رابط: صفحه‌ی `pages/workflow/design/ready-processes-page.tsx` و زبانه‌ی «درخواست‌ها و نامه‌ها» (`events-section.tsx`). **نامه‌ها** (5.5): مدل `Letter` (نوع، شماره با شمارنده‌ی `hr-letter`، تاریخ، گیرنده، متن ثابت‌شده هنگام صدور، امضاکننده و سمتش، یکی برای هر درخواست)؛ اقدام `hr.letter` (`letters.py`: متن از بخش تنظیمات `hr-letters` با جای‌گذارهای `letter_texts.PLACEHOLDERS` از پرونده، سمت جاری و فیلدهای فرم؛ امضاکننده آخرین تصمیم‌گیرنده‌ی درخواست؛ اعلان `hr.letter` با پیوند چاپ)؛ چهار فرایند آماده‌ی گروه «نامه‌ها و گواهی‌ها»؛ گواهی اشتغال، معرفی‌نامه و کسر از حقوق فقط برای شاغل؛ API `/api/hr/letters/` (`?employee=`، تک نامه، `placeholders/`)؛ برگه‌ی چاپ `/print/letters/:id` (`letter-print-page.tsx`). **مالی و رفاه** (5.6، `finance.py`): نوع‌های رویداد مالی (`leave_params.FINANCE`) با `EmployeeEvent.amount` (ریال؛ تاریخ = روز ثبت)، کمک‌هزینه با مبلغ تنظیمات (`ALLOWANCES`)، قاعده‌ها از بخش `hr-welfare` (سقف و شمار مساعده، سقف و اقساط و ضامن وام، سقف سالانه‌ی درمان، کمک‌هزینه‌ی ازدواج یک بار، پیوست فاکتور)؛ اقدام `hr.threshold` مبلغ را با `ceo_threshold` مقایسه و «yes»/«no» را در فیلد پنهان `needs_ceo` می‌نویسد تا مرحله‌ی شرطی مدیرعامل (جایگاه `hr.ceo`) با سقف روز اجرا شود؛ جایگاه‌های `hr.finance` و `hr.ceo` اکنون مصرف‌کننده دارند. **ورود کارمند** (5.7a، `hiring.py`): اقدام `hr.hire` (فیلدهای `leave_params.HIRE_FIELDS`) پرونده، حساب کاربری بی گذرواژه‌ی قابل استفاده (`set_unusable_password`، با `check_user_capacity`) و انتصاب در سمت را می‌سازد و رویداد `hire` ثبت می‌کند؛ پیش از ارسال: کد ملی تکراری و نام کاربری؛ `ReadyProcess.build` با `starters` (کد جایگاه نقش) فرایند را فقط برای دارندگان آن نقش شروع‌پذیر می‌کند و بی آن نقش نصب نمی‌شود؛ «فعال‌سازی همه» بقیه را نصب و پیام‌های ناکام را یک‌جا برمی‌گرداند. **تنظیمات** (5.4a، `sections.py`): بخش `hr-roles` (نقش‌های کارشناس منابع انسانی، امور مالی و مدیرعامل با `RoleField`، سقف مبلغ به ریال) و `hr-leave` (سهمیه‌ی سالانه با مقدار جدا برای هر کد نوع استخدام، سهم سال اول، سقف انتقال، مدت روز مرخصی برای مرخصی ساعتی، مانده‌ی منفی، سقف‌های اضافه‌کار، مهلت اصلاح تردد، و جدول نوع‌های مرخصی: شش نوع پایه‌ی حذف‌نشدنی با کد ثابت و نوع‌های سازمان با کد `custom-<n>`؛ «استحقاقی» همیشه فعال و کسرشونده). فرایندهای آماده (5.4b به بعد) این‌ها را می‌خوانند.

### اعلام‌ها روی AppConfig

هر برنامه (هسته یا ماژول) قابلیت‌هایش را اعلام می‌کند و هسته هرگز به ماژول‌ها وابسته نیست:

| اعلام | نوع | کاربرد |
|---|---|---|
| `nikyar_permissions` | `{کد: برچسب}` | مجوزها؛ نقش‌ها فقط کدهای ثبت‌شده را می‌پذیرند |
| `nikyar_lookups` | `LookupSpec` | فهرست‌های پایه‌ی سیستمی یا اولیه |
| `nikyar_settings` | `SettingsSection` | بخش صفحه‌ی تنظیمات |
| `nikyar_numbering` | `NumberingSpec` | نوع سند شماره‌دار با الگو و شروع دوباره‌ی پیش‌فرض |
| `nikyar_notifications` | `NotificationKind` | نوع اعلان با متن پیش‌فرض، جای‌گذارها (برچسب و مقدار نمونه) و کانال‌های پیش‌فرض |
| `nikyar_workflow_actions` | `WorkflowAction` | اقدام خودکار فرایند (کار خودکار در فرایندساز) با بررسی تنظیمات و اجرا |
| `nikyar_record_sources` | `RecordSource` | منبع فیلد «ارجاع به ثبت یا درخواست»: هدف‌ها برای طراح، موارد قابل انتخاب برای هر کاربر، نام و صفحه‌ی مشاهده‌ی هر مورد (فرم‌ها: `core/forms/records.py`؛ فرایندها: `core/workflow/records.py`) |
| `nikyar_module` | `ModuleSpec` | ماژول قابل فروش؛ اگر در لایسنس نباشد، API آن در دسترس نیست |
| `nikyar_session_flags` | `{نام: مسیر تابع(user) -> bool}` | پرچم‌های `flags` نشست برای منوی ماژول‌ها (دسترسی `flag:<نام>` در `navigation.ts`)؛ پرچم ماژول خارج از لایسنس false |
| `nikyar_profile_values` | `ProfileValue` | مقدار افزوده‌ی حساب کاربر (مثل کد ملی از پرونده) برای «پیش‌پر از حساب کاربر» فرم‌ساز؛ همه‌ی منبع‌ها در `profile` نشست (`fieldtypes.prefill_sources`، `user_profile`) |
| `nikyar_role_slots` | `RoleSlot` | نقشی که در تنظیمات تعیین می‌شود و گیرنده‌ی مرحله‌ها می‌شود (`{"type": "role_slot", "slot": "hr.hr"}`، `assignment.py`)؛ هنگام رسیدن کار خوانده می‌شود؛ جایگاه ماژول خارج از لایسنس به کسی نمی‌رسد |
| `nikyar_ready_processes` | `ReadyProcess` | فرم و فرایند آماده (5.4b، `core/workflow/ready.py`): `build` تعریف فرم و BPMN را می‌دهد (معمولاً با `builder.chain`)، `check` قاعده‌های پیش از ارسال؛ نصب با `Process.ready = کد`، «فعال‌سازی همه»، غیرفعال‌سازی بی حذف؛ API `/api/workflow/ready/` (مجوز طراحی فرایندها) |
| `nikyar_custom_fields` | `CustomFieldsSpec` | فیلدهای دلخواه یک رکورد ماژول: پس از migrate فرمی پنهان (`Form.purpose = fields`، `forms/custom_fields.py: sync`) با شناسه‌ی spec؛ طراحی با طراح فرم‌ساز (بی «تنظیمات»)، نیامدن در فهرست‌ها (`Form.objects.regular()`)، حذف‌نشدنی؛ سنجش مقدار با `custom_fields.clean(code, data, previous, user)` (آخرین نسخه‌ی منتشرشده، تصاحب و آزادسازی فایل) |
| `nikyar_demo_seed` | مسیر تابع | داده‌ی نمونه‌ی ماژول، پس از داده‌ی هسته در `seed_demo` (فقط نصب تازه) |
| `tasks.py` + `@task` | `TaskSpec` | کار پس‌زمینه، با زمان‌بندی دوره‌ای اختیاری |

### الگوهای سرور

- **نماها:** نماهای نوشتنی از `AuditedModelViewSet`؛ مجوز با `HasPerm` و `perms = {action: code}` (`None` یعنی هر کاربر واردشده)؛ فیلتر فهرست با `MultiValueFilter.filter_fields`؛ مرتب‌سازی متنی با `PersianOrderingFilter`؛ خطای قاعده‌ی کسب‌وکار با `BusinessError(message, fields)`.
- **لایسنس در `HasPerm`:** نمای ماژولی که در لایسنس نیست ۴۰۳ با کد `module_disabled`؛ پس از انقضا هر نوشتن ۴۰۳ با کد `license_expired`، مگر نماهای `license_exempt = True` (بارگذاری لایسنس، پشتیبان‌گیری، خوانده کردن و تنظیم اعلان).
- **تراکنش‌ها:** کارهای پس‌زمینه تراکنش خودشان را مدیریت می‌کنند (صف آن‌ها را درون تراکنش اجرا نمی‌کند)؛ پشتیبان‌گیری درون تراکنش باز اجرا نمی‌شود و خطای روشن می‌دهد؛ اعلان و آزادسازی فایل پس از ثبت قطعی (`on_commit`).
- **سند API:** نام سریالایزرها در کل پروژه یکتا باشد (نام مؤلفه‌ی OpenAPI از آن ساخته می‌شود)؛ پس از هر تغییر API: `cd frontend && npm run api:types`.

### فرم‌ساز

**تعریف فرم** (JSON، نسخه‌دار):

```json
{"sections": [{"id", "title", "help", "columns": 1-3, "labels", "visible_if",
               "fields": [{"id", "type", "label", "help", "required", "readonly", "unique", "prefill",
                           "span", "new_row", "default", "props", "visible_if", "required_if", "readonly_if"}]}],
 "rules": [{"id", "condition", "message", "field"}],
 "steps", "required_mark", "numbered", "submit_label", "intro", "confirmation"}
```

- شناسه‌ی هر فیلد کلید مقدارش در داده‌ی ثبت است و در نسخه‌ها پایدار می‌ماند؛ شناسه‌ی فیلدهای درون گروه‌ها هم در کل فرم یکتاست. `engine.check_definition()` هر ایراد را با مسیرش (`sections.0.fields.2.props.max`) و پیام فارسی برمی‌گرداند؛ طراح آن را روی همان فیلد نشان می‌دهد.
- ویژگی‌های سطح فرم (`engine.FORM_KEYS`): `steps` نمایش مرحله‌ای، `required_mark` (`star` / `word` / `optional`)، `numbered`، `submit_label`، `intro` و `confirmation` (قالب‌دار؛ پیام تأیید با جای‌گذارهای `{شماره}` `{نام}` `{تاریخ}` `{فرم}`).
- `engine.normalize_definition()` پیش از سنجش و ذخیره متن‌های قالب‌دار را با `html.py` (nh3) پاک‌سازی می‌کند.

**کاتالوگ نوع‌ها** (`fieldtypes.py`، یک کلاس با `@register` برای هر نوع):

- ویژگی‌ها (`Prop` با `kind`: int، number، bool، text، date، html، file، choice، choice_list، options، lookup_list، org_unit، role، record_source، extensions، columns، logic)، طرح JSON Schema مقدار، بررسی‌های فقط-سروری (`check`)، پیام‌های فارسی (`extra_messages`، `count_message`)، `normalize` (مثل پاک‌سازی متن غنی) و `file_ids` (فایل‌های مقدار).
- طراح پانل ویژگی‌ها را از `/api/forms/field-types/` می‌سازد؛ نوع یا ویژگی تازه خودکار در طراح می‌آید.
- **ارجاع به ثبت یا درخواست** (`record`): ویژگی «منبع» `<منبع>:<شناسه‌ی لاتین هدف>` (مثلاً `form:purchase-request`، `process:leave`)، تا انتقال فرم بین دو نصب سالم بماند. سرور فقط موردی را می‌پذیرد که کاربر اجازه‌ی دیدنش را دارد (ثبت‌های نهایی خودش یا فرم‌هایی که بیننده‌شان است؛ درخواست‌های خودش، به نامش، یا فرایندهایی که مدیرشان است). مقداری که از پیش در داده‌ی همان ثبت بوده دوباره سنجیده نمی‌شود، تا گیرنده‌ی مرحله‌ی بعد بتواند فرم را ذخیره کند. API: `GET /api/forms/record-sources/` (طراحان) و `GET /api/forms/record-lookup/?source=…&search=…` (انتخاب) یا `&ids=…` (نام برای نمایش؛ برای مورد نادیدنی فقط شماره و عنوان، بی ثبت‌کننده و پیوند).
- فهرست‌های کمکی: `UNIQUE_TYPES` (مقدار یکتا)، `PREFILL` (پیش‌پر از حساب کاربر)، `TABLE_CELL_TYPES` (خانه‌ی جدول گروه)، `COLUMN_TYPES` (فیلد درون گروه).

**طرح و اعتبارسنجی یک‌جا:**

- `engine.compile_schema(definition, partial=…)` طرح استاندارد 2020-12 می‌سازد (`x-messages` پیام فارسی هر کلیدواژه، `x-nikyar-type`، `x-item-label` برای خطای خانه‌های گروه)؛ نسخه‌ی پیش‌نویس الزامی‌ها را ندارد. قالب‌های ویژه: `jalali-date`، `jalali-datetime`، `uuid`، `email` و شناسه‌های ایرانی.
- مرورگر همان طرح را با ajv می‌سنجد و همان پیام‌ها را نشان می‌دهد؛ متن خطا فقط در سرور نوشته می‌شود. نمونه‌های مشترک (`shared/vectors/form-validation.json`، `form-rules.json`) یکسانی دو طرف را می‌آزمایند.
- ترتیب سنجش در `engine.validate_data` و `validateForm` مرورگر یکی است: پاک‌سازی و `normalize`، قاعده‌ها (پنهان، محاسبه، فقط‌خواندنی)، طرح JSON، بررسی‌های سروری، الزامی‌های شرطی، قاعده‌های بین فیلدها.

**قاعده‌ها** (`rules.py` و `components/form-renderer/rules.ts`):

- عبارت‌های JsonLogic (`panzi-json-logic` در سرور، `json-logic-js` در مرورگر) با عملگرهای مجاز (`rules.ALLOWED`) و عملگرهای ویژه‌ی `days_between`، `today` و `sum_of` (جمع ستون گروه یا حاصل‌ضرب دو ستون).
- `rules.apply()` فیلدهای پنهان (فیلد یا بخش)، الزامی و فقط‌خواندنی (شرطی یا همیشگی) و مقدار فیلدهای محاسبه‌ای را برمی‌گرداند؛ `form_rule_errors()` قاعده‌های بین فیلدها. سرور برای فیلد فقط‌خواندنی مقدار قبلی، پیش‌پر حساب یا پیش‌فرض را نگه می‌دارد.

**داده‌ی ثبت و فایل‌ها:**

- مقدار خالی (متن، فهرست، شیء یا مورد گروه کاملاً خالی) یعنی پر نشده و حذف می‌شود؛ تاریخ‌ها شمسی `1405/08/14`؛ مبلغ عدد صحیح ریال؛ ارجاع‌ها شناسه (یا فهرست با `multiple`)؛ پیوست و صدا فهرست شناسه‌ی فایل؛ گروه تکرارشونده فهرست شیء؛ «سایر» `{"other": "…"}`؛ موقعیت `{lat, lng, accuracy}`. کلید خطای خانه‌ی گروه «گروه.شماره.فیلد».
- فایل‌های مقدار: با ذخیره‌ی ثبت فایل تازه تصاحب و فایل کنارگذاشته پس از ثبت قطعی حذف می‌شود؛ فایل تازه فقط اگر بارگذاری خود کاربر و بی‌صاحب باشد پذیرفته است.
- فایل‌های خود تعریف (ویژگی `file`: تصویر و فایل راهنما) را `service.save_definition` تصاحب و `service.release_unused` فقط وقتی هیچ نسخه‌ای از هیچ فرمی از آن‌ها استفاده نکند حذف می‌کند.
- «مقدار یکتا» هنگام ثبت نهایی میان ثبت‌های نهایی همان فرم سنجیده می‌شود؛ شماره‌ی ثبت با شمارنده‌ی `form-شناسه` در `core.numbering` و فقط در نخستین ثبت نهایی صادر می‌شود.

**پذیرش** (`acceptance.py`): بازه‌ی پذیرش با زمان سرور، ظرفیت کل، سقف ثبت هر کاربر در دوره‌ی شمسی (روز، ماه، سال یا در کل)، محدودیت ثبت پیاپی (`submit_rate` بخش «سامانه و امنیت»، پیش‌فرض ۱۰ در دقیقه) و مهلت ویرایش. ثبت نهایی پس از قفل ردیف فرم سنجیده می‌شود؛ وضعیت (`availability`) در `available/` و `fill/` می‌آید.

**پس از ثبت و اعلان‌ها:** کار پس از ثبت (`after_submit`: بازگشت، صفحه‌ی تأیید یا نشانی) در تنظیمات فرم؛ اعلان‌های `forms.submitted` (به ثبت‌کننده) و `forms.new_submission` (به کاربران و نقش‌های تعیین‌شده) پس از ثبت قطعی. در فرم بی‌نام بینندگان نام و شناسه‌ی ثبت‌کننده را نمی‌بینند. کار روزانه‌ی `forms.old_drafts` پیش‌نویس‌های قدیمی را با فایل‌هایشان حذف می‌کند.

**ورود، خروج و الگوها** (`transfer.py`): یک قالب JSON (`format: nikyar-form`) با مشخصات فرم، تعریف یک نسخه و فایل‌های خود تعریف (base64). ورود همیشه فرم تازه با پیش‌نویس نسخه‌ی ۱ می‌سازد (شناسه‌ی تکراری پسوند عددی می‌گیرد؛ نقش‌ها منتقل نمی‌شوند). الگوهای آماده (`templates/*.json`) همین قالب‌اند.

**دسترسی:** `forms.design` طراحی و همه‌ی ثبت‌های نهایی؛ پر کردن با «همه‌ی کاربران» یا نقش‌های پرکننده (فرم فعال و منتشرشده)؛ نقش‌های بیننده ثبت‌های نهایی همان فرم را می‌بینند؛ پیش‌نویس فقط برای ثبت‌کننده. سوابق: ساخت، تغییر تنظیمات، انتشار و ثبت‌ها (ذخیره‌های پیاپی طراح نه).

**مرورگر** (`components/form-renderer`):

- `definition.ts` نوع‌های تعریف و تبدیل داده‌ی ذخیره‌شده ↔ حالت ورودی‌ها ↔ داده‌ی ارسالی (`toFormValues`، `toPayload`، `screenKey` برای شماره‌ی خطای موردهای گروه)؛ چیدمان با `spanClass`، `labelLayout`، `optionColumnsClass` و `FormGrid fixed` (ستون‌ها از پهنای تبلت، یکسان در طراح و پر کردن).
- `org-options.ts` نام واحدها، کاربران و سمت‌ها برای انتخاب و نمایش.
- `FormRenderer` و `FieldView` (هر بخش یک `Section`، هر فیلد یک `FormField` کیت؛ نشانه‌ی الزامی با `RequiredMarkContext`، شماره‌ی فیلدها، فیلد پنهان دیده نمی‌شود)؛ کنترل‌ها در `basic-fields`، `special-fields`، `system-fields`، `group-fields` (useFieldArray؛ جدول، کارت، فهرست) و `media-fields` (پیوند، متن غنی، صدا، بارکد، موقعیت، تصویر، فایل راهنما).
- `use-form-steps.ts` و `form-steps.tsx` فرم مرحله‌ای؛ `value-view.tsx` نمایش فقط‌خواندنی مقدارها (`FormSummary`: پنجره‌ی «مرور و تأیید نهایی» پیش از هر ثبت، و با `submitted` مشاهده و چاپ ثبت‌ها با امضا و مشخصات ذخیره‌شده)؛ `value-text.ts` متن یک‌خطی هر مقدار و `useNames` (نام کاربر، واحد، سمت و قلم فهرست) برای ستون‌های جدول ثبت‌ها، جست‌وجو و خروجی اکسل.
- ویرایشگر متن قالب‌دار (`components/rich-text.tsx`، Tiptap با React.lazy) فقط وقتی فرم آن را دارد بارگذاری می‌شود.

**ثبت‌ها** (`pages/forms/submissions`، 3.8): «ثبت‌های من» (`GET /api/forms/submissions/?mine=true` با جست‌وجو، مرتب‌سازی و صفحه‌بندی سمت سرور)، «ثبت‌های فرم‌ها» (`/api/forms/viewable/`) و جدول هر فرم (`/api/forms/{id}/report/`: ثبت‌های نهایی تا ۵۰۰۰ تازه‌تر با تعریف آخرین نسخه‌ی منتشرشده؛ ستون هر فیلد، جست‌وجو و فیلتر و خروجی در مرورگر)، صفحه‌ی مشاهده (`/forms/submissions/:id`) و برگه‌ی چاپ بی‌پوسته (`/print/submissions/:id`؛ A4، کاغذ همیشه روشن، `?print=1` پنجره‌ی چاپ را باز می‌کند). دیدن جدول‌ها با دسترسی `forms-viewer` در منو و مسیرها (پرچم `forms_viewer` نشست: طراح یا عضو نقش بیننده‌ی دست‌کم یک فرم).

**طراح** (`pages/forms/design`): `designer-model.ts` (تغییرهای خالص تعریف، فیلدهای درون گروه، بلوک‌ها، تاریخچه‌ی واگرد، نگاشت خطاهای سرور)، `canvas.tsx` (dnd-kit)، `toolbox.tsx`، `properties-panel.tsx` (ویرایشگر هر ویژگی بر اساس `kind`، و ویژگی‌های سطح فرم)، `rule-model.ts` و `rule-editors.tsx` (شرط‌های تودرتوی «و/یا»، فرمول، قاعده‌های فرم)، `version-diff.ts` و `versions-sheet.tsx` (مقایسه‌ی نسخه‌ها)، `preview-dialog.tsx` (صفحه‌ی بی‌پوسته‌ی `/forms/preview/:versionId` در iframe به پهنای دستگاه؛ `X_FRAME_OPTIONS = SAMEORIGIN`)، `form-settings-sheet.tsx`، `form-transfer-dialogs.tsx` (الگو و ورود).

**API:**

- `/api/forms/`: فرم‌ها و تنظیمات؛ `available/` (فرم‌های قابل پر کردن با وضعیت پذیرش)، `viewable/` (فرم‌هایی که ثبت‌هایشان را می‌بیند، با شمار ثبت‌ها)، `<id>/report/` (ثبت‌های نهایی با تعریف آخرین نسخه‌ی منتشرشده)، `field-types/`، `regions/`، `templates/` و `templates/<key>/`، `import/`، `<id>/fill/`، `<id>/new-draft/`، `<id>/export/?version=`.
- `/api/forms/versions/`: ویرایش تعریف پیش‌نویس، `publish/`؛ جزئیات نسخه طرح `schema` را هم دارد.
- `/api/forms/submissions/`: `data` و `submit`؛ فیلتر `mine`، `form` و `status`، جست‌وجو (`search`: شماره و عنوان فرم) و مرتب‌سازی (`number`، `updated_at`، `submitted_at`)؛ جزئیات هر ثبت `context` نسخه‌ی خودش و `editable_until` را دارد؛ `created_by` در فرم بی‌نام برای دیگران `null` است.

### گردش کار

**تعریف** (فایل BPMN 2.0 در `ProcessVersion.bpmn`؛ نسخه‌ی منتشرشده تغییرناپذیر و با نسخه‌ی ثابت فرم اصلی):

- **اقدام ماژول با پارامتر:** `WorkflowAction.params` (گزینه یا فیلد فرم، با `when`) را فرایندساز با ویرایشگر عمومی `ParamsEditor` نشان می‌دهد؛ اقدام‌های هسته ویرایشگر خودشان را دارند. **سازنده‌ی زنجیره** (`builder.sequence`، کوتاه‌شده‌ی `chain`): مرحله‌ها (تأیید/رد با پایان «رد شد») و اقدام‌های خودکار به ترتیب داده‌شده، با نمودار؛ `Step.when=(فیلد، مقدار)` مرحله‌ی شرطی با دروازه‌ی «بله/خیر» و مسیر گذر زیر خط اصلی؛ برای فرایندهای آماده. **قاعده‌ی پیش از ارسال:** `service._submit` پیش از شماره‌گذاری `ready.check` را صدا می‌زند.
- عنصرهای پشتیبانی‌شده (`bpmn.ELEMENTS`): رویداد شروع و پایان ساده، کار کاربری، کار خودکار (serviceTask با عملگر `nikyar`)، دروازه‌ی انحصاری و موازی، مرحله‌ی زمان‌بندی (رویداد میانی زمان‌دار با `timeDate` ثابت `wait_until`)، مسیر و یادداشت. اسکریپت و خدمت بیرونی همیشه رد می‌شوند.
- تنظیمات نیک‌یار در `spiffworkflow:properties` (JSON): کار کاربری `assignee`، `decisions` (با `comment`)، `completion`، `skip_same`، `fields` (دسترسی فیلدها)، `deadline`، `message`؛ کار خودکار `action`؛ مرحله‌ی زمان‌بندی `wait`؛ پایان `outcome`؛ مسیر `condition` (مدل سازنده؛ شرط اجرایی `conditionExpression`). `bpmn.check` همه را پیش از انتشار می‌سنجد و خطا را با شناسه‌ی عنصر برمی‌گرداند (`problems` زنده‌ی فرایندساز).
- **شرط‌ها:** عبارت پایتونی امن روی داده‌ی درخواست و `decision` (تصمیم آخرین مرحله)؛ `expressions.check` با فهرست سفید گره‌های `ast` و تفسیر بی eval در `SafeScriptEngine` (جایگزین موتور اسکریپت SpiffWorkflow).

**اجرا** (`service.py`؛ هر گام درون تراکنش و پس از قفل ردیف درخواست، وضعیت کامل موتور با سریال‌ساز SpiffWorkflow در `Request.state`؛ مشخصات اجرایی هر نسخه با `lru_cache`):

- **ثبت:** `save_request` پیش‌نویس (`status=draft`، طرح بی‌الزامی) را ذخیره می‌کند و با `submit` به `_submit` می‌رسد: سنجش کامل، شماره (`process-شناسه` در `core.numbering`)، فیلدهای سرور با `forms.service.server_values` (امضا فقط وقتی به نام خود ثبت می‌شود)، فیلد پنهان «از فرایند» (`PROCESS_VALUES`) و جلو بردن موتور. `created_by` پرکننده و `requester` درخواست‌دهنده است؛ `can_start_for_others` (نقش‌های `on_behalf_roles` یا مدیر کل).
- **انجام کار:** `complete` با قفل درخواست و کار؛ فقط فیلدهای `edit`/`required` همان مرحله از مرورگر پذیرفته می‌شوند (`access.py`: `step_definition`، `view_definition`، `visible_data`)؛ تصمیم در `decision`. `_sync` کارهای آماده را با جدول `Task` همگام، گیرنده‌ها را می‌سازد، مهلت را حساب می‌کند و اعلان «کار تازه» (با پیوند کار و پیوندهای ایمیل) می‌فرستد؛ پایان یا رد درخواست را ثبت می‌کند. `skip_same` کار را برای همان انجام‌دهنده‌ی مرحله‌ی قبل خودکار انجام می‌دهد.
- **گیرنده‌ها و جانشینی:** `assignment.resolve` (درخواست‌دهنده، مدیر مستقیم او یا انجام‌دهنده‌ی مرحله‌ای، مدیر واحد، سمت، نقش با «فقط واحد درخواست‌دهنده»، کاربر، فیلد کاربر فرم)؛ گیرنده‌ی خالی ← مدیران فرایند یا مدیر کل با `Task.fallback`. `acting_for` گیرنده، برداشته‌کننده‌ی کار گروهی، یا جانشین امروز یکی از آن‌ها برای همان فرایند (`delegation.delegates_of`) را با «به نیابت از» می‌پذیرد.
- **سیاست گیرنده** (`Task.completion`): `any` (کار گروهی، برداشتن با `Task.claimed_by`) یا `all` (نظر هر گیرنده در `TaskVote` و رویداد تاریخچه؛ تصمیمی غیر از نخستین کار را تمام می‌کند، وگرنه وقتی همه نظر داده‌اند؛ `service._vote`).
- **مهلت** (`deadlines.py`): `Task.due_at` و `remind_at` با `WorkCalendar` هنگام رسیدن کار. کار دوره‌ای `workflow.deadlines` (هر ۵ دقیقه، `core.jobs.registry.Every`) یادآوری را یک‌بار می‌فرستد و پس از پایان مهلت اعلان، رویداد «پایان مهلت» و یکی از: اعلان به مدیر، ارجاع (`assignment.resolve`)، تصمیم خودکار (`service.auto_complete`). متن دلخواه اعلان مرحله (`message`) با `placeholders.field_texts` و `notify(..., body=...)`.
- **مرحله‌ی زمان‌بندی:** `SafeScriptEngine(timer=...)` عبارت `wait_until` را با ویژگی `wait` (n روز یا ساعت کاری، یا آغاز روزِ یک فیلد تاریخ) حساب می‌کند و رویداد «انتظار» می‌نویسد؛ `_save` نزدیک‌ترین `Request.wake_at` را نگه می‌دارد و `fire_timers` (در همان کار دوره‌ای) درخواست را جلو می‌برد.
- **اقدام خودکار:** SpiffWorkflow برای serviceTask `call_service` موتور اسکریپت را صدا می‌زند و `SafeScriptEngine` آن را به `WorkflowAction` رجیستری (`nikyar_workflow_actions`) با زمینه‌ی درخواست می‌دهد؛ `check(config, form_definition)` هنگام انتشار، `run(context, config)` هنگام اجرا. اقدام‌های هسته (`actions.py`): `set_field`، `notify` (با جای‌گذار فیلدها) و `save_submission` (ثبت در فرم دیگر با نگاشت فیلدها، با `forms.service.system_submission`).
- **تأیید با یک کلیک از ایمیل** (`quick.py`، `QuickAction`): پیوندهای یک‌بارمصرف سه‌روزه برای تصمیم‌های بی یادداشت الزامی، فقط در ایمیل «کار تازه» (`notify(..., email_extra=...)`) و فقط با «نشانی سامانه»؛ ثبت با `POST` صفحه‌ی عمومی (باز شدن پیوند چیزی ثبت نمی‌کند).
- **پیگیری و گفت‌وگو:** `tracking.py` (نمودار انجام‌شده و جاری از وضعیت موتور، کارهای منتظر، تأییدها با امضای «حساب من»، لغو تا پیش از نخستین تصمیم) و `discussion.py` (`RequestComment`؛ شرکت‌کنندگان: درخواست‌دهنده و ثبت‌کننده، گیرنده‌ها، انجام‌دهندگان، جانشین مجاز، مدیران فرایند و مدیر کل؛ اعلان `workflow.comment`). صفحه‌ی درخواست همین دسترسی را دارد.
- **مدیریت درخواست‌ها** (`manage.py`): مدیر = مجوز `workflow.manage` (همه‌ی فرایندها) یا «مدیران فرایند»؛ `managed_requests` و `problem_filter` (بی‌گیرنده، دیرکرده). کارها با دلیل الزامی و رویداد تاریخچه (`REASSIGNED`، `MOVED`، `RESTARTED`، `CANCELLED`): `reassign`، `move_to` (فقط به مرحله‌های گذشته با `reset_from_task_id`؛ پرش به جلو در Spiff مرحله‌ی فعلی را باز نگه می‌دارد)، `restart` (`BpmnWorkflow` تازه با داده‌ی فعلی)، `cancel`. `_restart_tasks` کارهای باز را لغو و ردیف‌های انجام‌شده‌ای را که شناسه‌ی Spiff آن‌ها دوباره آماده شده جدا می‌کند تا تاریخچه بماند.
- **گزارش عملکرد** (`performance.py`): درخواست‌های ارسال‌شده در بازه در دامنه‌ی مدیر؛ زمان‌ها با `WorkCalendar.working_hours_between` (ساعت کاری)؛ گروه‌بندی کارها به فرایند، مرحله، فرد (انجام‌دهنده یا گیرنده‌های کار منتظر) و واحد (سمت اصلی امروز، هر کار یک بار برای هر واحد)؛ دیرکرد از `due_at`.
- **کارتابل** (`inbox.py`): زبانه‌های «منتظر من» (تک‌گیرنده، برداشته‌شده یا «همه‌ی گیرنده‌ها» بی نظر)، «گروهی»، «جانشینی» و «انجام‌شده» (۵۰۰ آخر)، شمارش و زمینه‌ی صفحه‌ی کار (تعریف و طرح فرم با دسترسی مرحله، تصمیم‌ها، نظرها، تاریخچه). دیدن کار: گیرنده‌ها، جانشین مجاز، انجام‌دهنده، مدیران فرایند و مدیر کل.

**API** (`/api/workflow/`):

- `processes/` (`workflow.design`): فرایندها با شروع‌کنندگان، مدیران، ثبت به نام دیگری و شماره‌گذاری؛ `form-options/`، `action-types/`، `target-forms/`، `from-template/`، `<id>/form-definition/`، `<id>/new-draft/`، `<id>/copy/`. `versions/`: پیش‌نویس BPMN با `problems` زنده، `publish/`. `process-lookup/`: عنوان فرایندها برای هر کاربر.
- `start/`: فرایندهای قابل شروع کاربر و `<id>/` زمینه‌ی پر کردن (`StartContext`). `requests/`: درخواست‌های کاربر (ثبت‌کرده یا به نامش، با `current_step`)؛ ایجاد و ویرایش پیش‌نویس، `submit`، `requester`، حذف پیش‌نویس؛ `<id>/track/`، `<id>/cancel/` و `<id>/manage/` (`reassign|move|restart|cancel` با دلیل). `manage/?status=&process=&problem=`: درخواست‌های مدیر. `performance/?process=&start=&end=`: گزارش عملکرد.
- `tasks/?box=mine|group|delegated|done`، `counts/`، `<id>/` (با `detail`)، `<id>/complete/`، `<id>/claim/`، `<id>/release/`. `comments/?request=…`. `quick/<نشانه>/` (عمومی، بی ورود).

**رابط کاربری:**

- **فرایندساز** (`pages/workflow/design`): `process-design-page.tsx` (فهرست) و `process-sheet.tsx` (مشخصات)؛ `process-designer-page.tsx` (ذخیره‌ی خودکار، انتشار، فهرست ایرادها)؛ `process-canvas.tsx` (bpmn-js: Modeler یا NavigatedViewer، نشانه‌ی ایراد، و `highlights` برای مرحله‌های انجام‌شده و جاری در پیگیری)؛ `bpmn-modules.ts` (ترجمه‌ی فارسی، نوار ابزار و منوی کنار عنصر محدود به عنصرهای پشتیبانی‌شده)؛ `bpmn-theme.css` (نگاشت `--bio-*` به توکن‌ها و رنگ نشانه‌ها)؛ `spiffworkflow-moddle.ts`؛ `bpmn-props.ts` (ویژگی‌ها، شرط، مسیر پیش‌فرض و زمان انتظار با فرمان‌های bpmn-js، پس واگرد کار می‌کند)؛ `condition-python.ts`؛ `process-properties.tsx` (پانل ویژگی‌ها: گیرنده، تصمیم‌ها، سیاست گیرنده، مهلت، متن اعلان، دسترسی فیلدها، اقدام‌ها، زمان انتظار)؛ `process-versions-sheet.tsx`.
- **درخواست جدید** (`pages/workflow/requests`): `new-request-page.tsx` و `request-fill-page.tsx` (پرکننده‌ی مشترک `pages/forms/fill-form.tsx` با مقصد درخواست و انتخاب «به نام»).
- **درخواست‌های من**: `my-requests-page.tsx`، `request-page.tsx` (وضعیت، نمودار، فرم، گفت‌وگو، تاریخچه، لغو)، `request-print-page.tsx` (چاپ A4 با تأییدها و امضاها، `/print/requests/:id`).
- **مدیریت درخواست‌ها** (`pages/workflow/manage`): `manage-requests-page.tsx` (زبانه‌ها در `?view=`) و `manage-section.tsx` (بخش «مدیریت درخواست» صفحه‌ی درخواست با پنجره‌ی هر کار)؛ `performance-page.tsx` (گزارش عملکرد با نمودار recharts از `components/ui/chart` و جدول‌های `DataTable`).
- **کارتابل** (`pages/workflow/tasks`): `inbox-page.tsx` (زبانه‌ها در `?box=`)، `task-page.tsx` (فرم مرحله با `FormRenderer`، تصمیم با یادداشت و پنجره‌ی تأیید، برداشتن، نظرها)، `discussion.tsx` و `history.tsx` (مشترک با صفحه‌ی درخواست). شمار کارها با `useTaskCounts` (`app/workflow.ts`) در منو، زبانه‌ها و پیشخوان.
- **تأیید از ایمیل:** `pages/quick-action-page.tsx` (مسیر عمومی `/quick/:token` بیرون از نگهبان ورود).

### تنظیمات

```python
# apps.py
nikyar_settings = [SettingsSection(code="org-profile", title="مشخصات سازمان", serializer="core.org.sections.OrgProfileSettings")]
# هر فیلد سریالایزر برچسب فارسی و default دارد؛ اعتبارسنجی با validate_<field>.
# API: GET/PUT /api/settings/org-profile/ (مجوز settings.manage) — خواندن در کد: core.settings.service.read("org-profile")
```

- بخشی که داده‌ی ساخت‌یافته‌ی خودش را دارد (مثل «شماره‌گذاری اسناد» و «متن اعلان‌ها») `serializer` ندارد: در فهرست بخش‌ها می‌آید ولی API و فرمش را خودش می‌سازد.
- فیلدهای ویژه: `FileRefField` (شناسه‌ی فایل؛ تصاحب فایل جدید و حذف قبلی، نام فایل در سوابق)، `SecretField` (رمزشده؛ ماسک «••••••••» یعنی بدون تغییر؛ در سوابق فقط «تنظیم شده»)، `WeekScheduleField` (ساعت کاری هفته). قلاب‌های عمومی فیلد: `display()` برای سوابق، `resolve()` و `on_change()` هنگام ذخیره.
- **قاعده‌ی مالک محصول (5.4a):** هر عدد یا قاعده‌ای که میان سازمان‌ها فرق می‌کند فیلد یک بخش تنظیمات با پیش‌فرض است، نه ثابت در کد؛ مصرف‌کننده هنگام کار `read(code)` را می‌خواند (عدد بازه‌دار با `core.settings.sections.count_field`). ثابت‌های فنی (پاک‌سازی پیوست‌های رها، سقف ردیف‌ها، طول متن‌ها، فاصله‌ی کارهای دوره‌ای، عددهای لایسنس) آگاهانه در کد می‌مانند.
- **بخش ماژول:** ماژول بخش خودش را با همان `nikyar_settings` اعلام می‌کند. اگر ماژول در لایسنس نباشد، بخش در فهرست نمی‌آید و API آن `module_disabled` می‌دهد (نمای هر بخش به برنامه‌ی اعلام‌کننده‌اش نسبت داده می‌شود تا `HasPerm` بسنجد؛ `service.module_of`).
- **برگه‌ی چاپ مشترک** (`components/print-sheet.tsx`): `PrintSheet` (کاغذ همیشه روشن، نوار چاپ، `?print=1`، عنوان زبانه، اسکلت و خطا؛ محتوا با تابع `(printedAt) => …`) و `PrintHeader` (لوگو، نام سازمان، عنوان، شماره، تاریخ)؛ چاپ ثبت فرم، درخواست و نامه‌ی پرسنلی همه از آن.
- در رابط کاربری، فرم هر بخش در `pages/admin/settings/` (بخش‌های ماژول در صفحه‌های همان ماژول، مثل `pages/hr/settings-*.tsx`) ساخته و در `SECTION_FORMS` صفحه‌ی تنظیمات ثبت می‌شود (قاب: `SettingsForm` روی `SectionForm`؛ عدد با واحد: `UnitInput` و `countRule`).

---

## رابط کاربری (`frontend/src`)

| مسیر | محتوا |
|---|---|
| `app/` | نشست و نگهبان ورود (`auth.tsx`)، مسیرها با نگهبان مجوز (`router.tsx`؛ بی ورود فقط `/login` و پیوند ایمیل `/quick/:token`؛ برگه‌های چاپ و پیش‌نمایش بی پوسته)، منو با مجوز هر بخش و گروه‌های «کار من»، «فرم‌ساز و فرایندساز»، «سازمان و کاربران»، «پیکربندی»، «نگه‌داری سامانه» و «کیت رابط کاربری» (`navigation.ts`؛ مورد فعال با `activeUrl`: دقیق‌ترین پیوند، تا «/forms/design» «فرم‌ها» را فعال نکند)، QueryClient، و هوک‌های داده‌ی سراسری: `branding`، `work-calendar`، `notifications`، `license`، `delegations`، `lookups`، `forms` (کلیدها، نقش‌ها برای انتخاب، کاتالوگ نوع فیلدها)، `workflow` (کلیدهای درخواست‌ها، کارتابل و فرایندساز، `useTaskCounts`، رنگ وضعیت درخواست)؛ حالت‌های مسیر (`route-states.tsx`: بارگذاری، `PageError` برای خطای داده‌ی اصلی صفحه، بی‌مجوز). دسترسی هر مورد منو و مسیر با `isAllowed` (کد مجوز، `superuser`، یا `forms-viewer` و `workflow-manager` از پرچم‌های نشست) |
| `lib/` | `format.ts` (ارقام فارسی، مبلغ، حجم فایل، تاریخ شمسی، `numberToWords` برای مبلغ به حروف، `formatDuration`)؛ `validators.ts` (شناسه‌های ایرانی + طرح‌های zod)، `banks.ts` (نام بانک از شبا و کارت، فقط نمایشی)، `files.ts` (بارگذاری با پیشرفت، `fileUrl`، `useFileInfo`)، `rich-text.ts` (کلاس و نوع‌های مشترک متن قالب‌دار)، `api/` (کارخواه با نوع‌های خودکار، `unwrap` و `ApiError` با پیام فارسی) |
| `components/ui/` | اجزای shadcn — فقط با `npx shadcn@latest add <name>`؛ تغییرها حداقلی و توضیح‌دار (ترجمه‌ی متن‌ها، `containerClassName` جدول، پر شدن راست‌به‌چپ نوار پیشرفت) |
| `components/layout/` | پوسته: نوار بالا (زنگوله‌ی اعلان، منوی کاربر)، منوی کناری، زبانه‌های صفحه‌های باز (با دکمه‌ی جابه‌جایی)، جست‌وجوی سراسری، `PageHeader`، `Section`، `SectionNav`، نوار وضعیت لایسنس، `BrandMark` |
| `components/data-table/` | جدول داده‌ی کامل روی TanStack Table v9 |
| `components/form/` | `useAppForm`، `FormField`، `StaticField` (فقط‌خواندنی با همان چیدمان)، `FormGrid` (با `columns` بیشینه‌ی ستون؛ `fixed` برای ستون‌های ثابت فرم‌ساز)، `ErrorSummary` (خطاهای تودرتو هم)، فیلدهای ایرانی و `JalaliDateInput` و `TimeInput` و `MoneyInput` (تومان یا ریال) و `PlateInput` (پلاک خودرو) (`inputs.tsx`)، `FormSheet` (پانل ویرایش، با اقدام فرعی)، `SectionForm` (بخش فرم‌دار صفحه)، `TokenInput` (درج نشانه در جای مکان‌نما)، `applyServerErrors`، `UnsavedChangesGuard` |
| `components/form-renderer/` | نمایشگر فرم‌ساز (بخش «فرم‌ساز» بالاتر): `definition.ts`، `validate.ts` (ajv و `formResolver`)، `rules.ts`، `form-renderer.tsx`، کنترل‌های هر گروه نوع، `use-form-steps.ts`، `value-view.tsx`، `value-text.ts` |
| `components/files/` | `FileDropzone` (نوع‌های مجاز هر فیلد، «عکس با دوربین» و «ضبط صدا» با ضبط‌کننده‌ی گوشی)، `AttachmentList`، `FilePreviewDialog` (تصویر، PDF و پخش صدا)، `ImageInput` (لوگو و امضا)، `FilePicker` (انتخاب یک فایل برای API خاص، بدون input انگلیسی مرورگر) |
| `components/delegation/` | جدول و پانل جانشین تازه؛ در «حساب من» و صفحه‌ی «جانشینی‌ها» |
| `components/` (دیگر) | `info-tip.tsx` (راهنمای ⓘ)، `search-picker.tsx` (انتخاب یکی یا چند از فهرست محلی با جست‌وجو و تورفتگی درختی)، `signature-pad.tsx` (امضای دستی و بارگذاری PNG)، `confirm-dialog.tsx` (با `requireText`)، `jalali-calendar.tsx` (تقویم آوان با تعطیلات و روزهای غیرکاری سازمان)، `user-picker.tsx`، `status-badge.tsx`، `description-list.tsx`، `rich-text.tsx` و `rich-text-editor.tsx` (نمایش و ویرایش متن قالب‌دار)، `theme-provider.tsx` (پوسته‌ی روشن/تیره) |
| `pages/` | پیشخوان، اعلان‌ها، ورود؛ `forms/` («فرم‌ها»، پر کردن با پیش‌نویس خودکار در `fill-form.tsx` که درخواست‌های فرایند هم از آن استفاده می‌کنند، ویرایش در مهلت، پنجره‌ی مرور پیش از ثبت `review-dialog.tsx`، صفحه‌ی تأیید `confirmation.tsx`؛ `submissions/`: ثبت‌های من، ثبت‌های فرم‌ها، مشاهده و چاپ؛ `design/`: طراحی فرم‌ها؛ هر دو در بخش «فرم‌ساز» بالاتر)؛ `workflow/` (فرایندساز، درخواست‌ها، کارتابل، مدیریت درخواست‌ها و گزارش عملکرد؛ بخش «گردش کار» بالاتر)، `quick-action-page.tsx` (تأیید از ایمیل)؛ `account/` («حساب من» با زبانه در نشانی `?tab=`)؛ `admin/` (کاربران، نقش‌ها، ساختار سازمانی، فهرست‌های پایه، جانشینی‌ها، تقویم کاری، پشتیبان‌گیری، کارهای سامانه، سوابق، لایسنس، تنظیمات)؛ `ui-kit/` (نمونه‌ی اجزا، فقط مدیر کل) |

### جدول داده

```tsx
const view = useTableView("employees", { defaultSort: "name" })       // نشانی صفحه + ترجیحات کاربر؛ defaultHidden: ستون‌های پنهان پیش‌فرض
const table = useDataTable({ view, columns, data, getRowId })          // سمت مرورگر
// سمت سرور: useQuery({ queryKey: ["employees", view.query], ... }) و rowCount={data.count}
<DataTable table={table} view={view} caption="…" rowHref={(r) => `/…/${r.id}`} exportFileName="…" />
```

- جست‌وجو، مرتب‌سازی، فیلترها و صفحه در **نشانی صفحه** می‌مانند (اشتراک‌پذیر، دکمه‌ی بازگشت). چند جدول در یک صفحه با `urlKey` جدا.
- ستون‌های نمایان، عرض، سنجاق و تراکم **ترجیح هر کاربر** در حافظه‌ی مرورگر.
- `meta` هر ستون: `label` (نام فارسی)، `primary` (پیوند ردیف و عنوان کارت موبایل)، `wrap` (ستون متنی که فضای اضافه را می‌گیرد و شکسته می‌شود)، `filterOptions` (فیلتر چندانتخابی)، `align`، `exportValue`.
- جدول در عرض صفحه جا می‌شود و نوار پیمایش داخلی ندارد: ستون‌های کوتاه به اندازه‌ی محتوا، ستون‌های `wrap` بقیه‌ی عرض. عرض ثابت فقط برای ستون سنجاق‌شده یا ستونی که کاربر عرضش را تغییر داده.
- روی موبایل هر ردیف یک کارت است. `compact` برای فهرست‌های کوتاه و ثابت: بدون نوار ابزار و صفحه‌بندی.

### فرم

`useAppForm(schema, defaults)` + `Section` (یا `SectionForm` / `FormSheet`) + `FormGrid` (یک/دو/سه ستون بر اساس عرض واقعی بخش) + `FormField` (برچسب کنار فیلد با عرض ثابت ۸rem، بالای فیلد روی موبایل؛ راهنما در ⓘ با `description`، اطلاعات همیشه‌پیدا با `hint`) + `ErrorSummary`. مقدار فیلدهای ایرانی همیشه یکسان‌سازی‌شده (ارقام لاتین) است. تاریخ: `JalaliDateInput` (تایپ مستقیم با جداکننده‌ی خودکار یا انتخاب از تقویم) با مقدار رشته‌ی شمسی `1405/08/14` و اعتبارسنجی `schemas.jalaliDate`. ستاره‌ی الزامی بیرون از برچسب است تا نام دسترس‌پذیر فیلد دقیقاً همان برچسب باشد.

### سلسله‌مراتب متن و راهنما (قاعده‌ی مالک محصول)

- **متن اصلی** (برچسب، مقدار فیلد، دکمه، محتوای جدول): `text-xs` (۱۳px).
- **متن کمکی** (توضیح، راهنما، اطلاعات جانبی، حجم و زمان فایل): یک پله کوچک‌تر `text-2xs` (۱۲px) و کم‌رنگ؛ هرگز هم‌اندازه‌ی متن اصلی.
- **راهنمای توضیحی** به‌طور پیش‌فرض جمع‌شده است: نشانه‌ی ⓘ کنار برچسب یا عنوان؛ با نشانگر ماوس یا زدن (لمسی و صفحه‌کلید) باز می‌شود. صفحه‌خوان متن را با `aria-describedby` همراه همان فیلد یا بخش می‌شنود.
  - `FormField description`، `Section description` و `PageHeader description` همه ⓘ هستند.
- **فقط اطلاعاتی که همیشه باید دیده شود** باز نمایش داده می‌شود، با متن کوچک: مقدار پویا، شمارنده، نتیجه‌ی محاسبه، وضعیت رکورد — `FormField hint`، `Section meta`، `PageHeader meta`.
- پیام خطا، متن پنجره‌ی تأیید و پیام حالت خالی متن اصلی‌اند، نه راهنما.

---

## آزمون‌ها

- **سرور:** pytest روی پایگاه SQLite **فایلی** (مثل نصب واقعی؛ آزمون هم‌زمانی واقعی است)، داده و پشتیبان هر آزمون در پوشه‌ی موقت. کار آزمایشی `tests.flaky` در `conftest.py`. آزمونی که پشتیبان می‌گیرد یا بازیابی می‌کند `django_db(transaction=True)` است.
- **رابط کاربری:** vitest برای منطق: `lib/`، تبدیل‌ها و قاعده‌های نمایشگر فرم، مدل طراح، سازنده‌ی قاعده و فرمول، مقایسه‌ی نسخه‌ها، پیام صفحه‌ی تأیید و مورد فعال منو.
- **نمونه‌های مشترک** (`shared/vectors/`): داده‌ی آزمونی که آزمون سرور و مرورگر هر دو می‌خوانند تا رفتار دو طرف یکی بماند: `ir-identifiers.json` (شناسه‌های ایرانی) و `form-rules.json` (قاعده‌ها: پنهان، الزامی، فقط‌خواندنی، محاسبه و خطاها)، `form-validation.json` (تعریف، طرح‌ها و خطاهای مورد انتظار؛ ساخته از موتور سرور با `python -m tests.form_vectors`؛ آزمون سرور تازه بودنش را و آزمون مرورگر یکسانی خطاهای ajv را می‌سنجد).
- **مرورگر (Playwright):** سه اندازه (لپ‌تاپ ۱۰۹۳×۶۰۰ با بزرگ‌نمایی ۱٫۲۵، مانیتور ۱۹۲۰، موبایل) و axe در هر صفحه‌ی مهم (پوسته‌ی تیره در آزمون پوسته).
  - سرور جدا روی درگاه ۸۱۰۰ با پایگاه تازه (`e2e/start-backend.mjs`) همراه اجراکننده‌ی کارها (هر ثانیه)؛ پیامک و ایمیل در فایل نوشته می‌شوند (`NIKYAR_FAKE_DELIVERY`).
  - سه اندازه هم‌زمان روی یک سرور اجرا می‌شوند: تغییر داده‌ی سراسری (تنظیمات، لایسنس، الگوی شماره) فقط در پروژه‌ی `desktop`؛ داده‌ی هر آزمون یکتا (کاربر تازه، سال جدا برای هر اندازه).
  - آزمون بازیابی پشتیبان در پروژه‌ی جدای `restore` پس از همه‌ی آزمون‌ها و به‌تنهایی.
  - `expectAccessible` نشانگر را کنار می‌برد، به بالای صفحه می‌رود و اعلان‌های گذرا (sonner) را نمی‌سنجد.

---

## قواعد

- همه‌ی متن‌های کاربر فارسی رسمی؛ ارقام نمایشی فارسی (`formatNumber`، `toFaDigits`)؛ تاریخ‌ها شمسی. هیچ متن انگلیسی مرورگر (مثل input فایل) نمایش داده نمی‌شود.
- متن کمکی همیشه یک پله کوچک‌تر از متن اصلی است و راهنمای توضیحی در ⓘ جمع می‌شود.
- فقط کلاس‌های منطقی Tailwind (`ms-`، `pe-`، `start-`، `text-start`).
- رنگ‌ها فقط از توکن‌های `index.css`؛ رنگ هرگز تنها حامل معنا نیست. نوار پیمایش همه‌جا باریک و هم‌رنگ پوسته است (`--scrollbar-thumb`).
- کد مرده، تکراری یا یتیم نگه داشته نمی‌شود؛ هر وابستگی باید استفاده شود.
