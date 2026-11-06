"""
تنظیمات نیک‌یار. همه‌چیز از متغیرهای محیطی خوانده می‌شود تا روی هر سرور سازمان بدون تغییر کد نصب شود.

NIKYAR_DEBUG=1           حالت توسعه
NIKYAR_SECRET_KEY        کلید امنیتی (اگر نباشد، یک‌بار ساخته و در data/secret_key نگه داشته می‌شود)
NIKYAR_ALLOWED_HOSTS     نام‌ها/نشانی‌های مجاز، جداشده با ویرگول (پیش‌فرض: همه، برای شبکه‌ی داخلی)
NIKYAR_DB_ENGINE         sqlite (پیش‌فرض) یا postgres
NIKYAR_DB_NAME/USER/PASSWORD/HOST/PORT   برای PostgreSQL
NIKYAR_LOGIN_RATE        سقف تلاش ورود از هر IP (پیش‌فرض 10/min)
"""

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
VERSION = "0.2.0"

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

if os.environ.get("NIKYAR_DB_ENGINE", "sqlite") == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("NIKYAR_DB_NAME", "nikyar"),
            "USER": os.environ.get("NIKYAR_DB_USER", "nikyar"),
            "PASSWORD": os.environ.get("NIKYAR_DB_PASSWORD", ""),
            "HOST": os.environ.get("NIKYAR_DB_HOST", "127.0.0.1"),
            "PORT": os.environ.get("NIKYAR_DB_PORT", "5432"),
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
    # سقف تلاش ورود از هر نشانی IP (در برابر حدس گذرواژه)
    "DEFAULT_THROTTLE_RATES": {"login": os.environ.get("NIKYAR_LOGIN_RATE", "10/min")},
    "SEARCH_PARAM": "search",
    "ORDERING_PARAM": "ordering",
}

SESSION_COOKIE_AGE = 60 * 60 * 10  # یک روز کاری
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
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "core.kernel.schema.require_response_fields",
    ],
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
}
