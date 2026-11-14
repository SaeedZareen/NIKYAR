"""
تنظیمات نیک‌یار. همه‌چیز از متغیرهای محیطی خوانده می‌شود تا روی هر سرور سازمان بدون تغییر کد نصب شود.

NIKYAR_DEBUG=1           حالت توسعه
NIKYAR_SECRET_KEY        کلید امنیتی (اگر نباشد، یک‌بار ساخته و در data/secret_key نگه داشته می‌شود)
NIKYAR_ALLOWED_HOSTS     نام‌ها/نشانی‌های مجاز، جداشده با ویرگول (پیش‌فرض: همه، برای شبکه‌ی داخلی)
NIKYAR_DB_ENGINE         sqlite (پیش‌فرض) یا postgres؛ بر data/database.json (ابزار database-tool.bat) مقدم است
NIKYAR_DB_NAME/USER/PASSWORD/HOST/PORT   برای PostgreSQL
"""

import json
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BASE_DIR.parent
DATA_DIR = Path(os.environ.get("NIKYAR_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
FRONTEND_DIST = REPO_DIR / "frontend" / "dist"


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(int(default))).lower() in {"1", "true", "yes", "on"}


def secret_key() -> str:
    if key := os.environ.get("NIKYAR_SECRET_KEY"):
        return key
    path = DATA_DIR / "secret_key"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(50), encoding="utf-8")
    return path.read_text(encoding="utf-8").strip()


SECRET_KEY = secret_key()
DEBUG = env_bool("NIKYAR_DEBUG")
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("NIKYAR_ALLOWED_HOSTS", "*").split(",") if h.strip()]
VERSION = "0.6.0"

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    # هسته‌ی نیک‌یار (هسته هرگز به ماژول‌ها وابسته نیست)
    "core.kernel",
    "core.accounts",
    "core.org",
    "core.audit",
    "core.lookups",
    "core.settings",
    "core.files",
    "core.workcalendar",
    "core.numbering",
    "core.jobs",
    "core.backup",
    "core.notifications",
    "core.messaging",
    "core.delegation",
    "core.licensing",
    "core.forms",
    "core.workflow",
    "core.setup",
    # ماژول‌های قابل فروش (backend/modules)؛ هسته به آن‌ها وابسته نیست.
    "modules.hr",
]

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# پیش‌نمایش فرم در طراح (قاب همین سامانه) و پیش‌نمایش PDF؛ سایت‌های دیگر سامانه را در قاب نمی‌گذارند.
X_FRAME_OPTIONS = "SAMEORIGIN"

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
            ],
        },
    },
]

DB_DEFAULTS = {"engine": "sqlite", "name": "nikyar", "user": "nikyar", "password": "", "host": "127.0.0.1", "port": "5432"}


def database_config() -> dict:
    """اتصال پایگاه داده: data/database.json (نوشته‌ی «python manage.py database»)، و متغیرهای محیطی NIKYAR_DB_* مقدم بر آن."""
    path = DATA_DIR / "database.json"
    stored = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return {key: os.environ.get(f"NIKYAR_DB_{key.upper()}", str(stored.get(key, default))) for key, default in DB_DEFAULTS.items()}


DB = database_config()
if DB["engine"] == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": DB["name"],
            "USER": DB["user"],
            "PASSWORD": DB["password"],
            "HOST": DB["host"],
            "PORT": DB["port"],
            "CONN_MAX_AGE": 60,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": DATA_DIR / "nikyar.db",
            "OPTIONS": {"init_command": "PRAGMA journal_mode=WAL;", "transaction_mode": "IMMEDIATE"},
        }
    }

# نسخه‌ی موقت بازیابی پشتیبان (core.backup.service): همیشه SQLite، فقط هنگام بازیابی و روی یک فایل موقت باز می‌شود
DATABASES["nikyar_restore"] = {"ENGINE": "django.db.backends.sqlite3", "NAME": DATA_DIR / "restore-staging.db"}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fa"
TIME_ZONE = "Asia/Tehran"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = DATA_DIR / "static"
MEDIA_ROOT = DATA_DIR / "media"
# فایل‌های ساخته‌شده‌ی رابط کاربری (frontend/dist) از ریشه‌ی سایت سرو می‌شوند.
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.exists() else None
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    # رابط کاربری از همان نشانی سرو می‌شود؛ نشست Django + محافظت CSRF.
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "core.kernel.api.Pagination",
    "EXCEPTION_HANDLER": "core.kernel.api.exception_handler_fa",
    "SEARCH_PARAM": "search",
    "ORDERING_PARAM": "ordering",
}

# مدت نشست، سقف تلاش ورود و سقف ثبت پیاپی فرم در «تنظیمات › سامانه و امنیت» است (core.settings.sections).
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = SESSION_COOKIE_SAMESITE = "Lax"

SPECTACULAR_SETTINGS = {
    "TITLE": "NIKYAR API",
    "VERSION": VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
    # سند API فقط برای کاربر واردشده
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAuthenticated"],
    # نوع جداگانه برای بدنه‌ی درخواست (بدون فیلدهای فقط‌خواندنی) تا نوع‌های رابط کاربری دقیق باشند.
    "COMPONENT_SPLIT_REQUEST": True,
    # کانال‌های پیامک/ایمیل در اعلان‌ها و گزارش ارسال‌ها یک مجموعه‌اند؛ یک نام در سند API.
    "ENUM_NAME_OVERRIDES": {
        "NotificationChannelEnum": "core.notifications.views.CHANNEL_CHOICES",
        "FormVersionStatusEnum": "core.forms.models.FormVersion.Status",
        "FormSubmissionStatusEnum": "core.forms.models.Submission.Status",
        "EmployeeStatusEnum": "modules.hr.models.Employee.Status",
    },
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "core.kernel.schema.require_response_fields",
    ],
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
}
