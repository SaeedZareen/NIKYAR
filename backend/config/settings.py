"""
تنظیمات اصلی نیک‌یار

همه‌ی تنظیمات حساس از «متغیرهای محیطی» خوانده می‌شوند تا روی سرور مشتری
بدون تغییر کد قابل پیکربندی باشد.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name, default=None):
    return os.environ.get(name, default)


SECRET_KEY = env("NIKYAR_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = env("NIKYAR_DEBUG", "1") == "1"
ALLOWED_HOSTS = env("NIKYAR_ALLOWED_HOSTS", "*").split(",")
CSRF_TRUSTED_ORIGINS = [o for o in env("NIKYAR_CSRF_ORIGINS", "").split(",") if o]

# ---------------------------------------------------------------------------
# ماژول‌ها
# هر ماژول نیک‌یار یک اپ جنگو داخل پوشه‌ی apps است. ماژول‌های هسته همیشه
# فعال‌اند؛ ماژول‌های تجاری (انبار، حسابداری و ...) با لایسنس فعال می‌شوند.
# ---------------------------------------------------------------------------
NIKYAR_APPS = [
    # هسته (همیشه فعال)
    "core.kernel",
    "core.accounts",
    "core.org",
    "core.audit",
    "core.lookups",
    "core.forms",
    "core.files",
    "core.numbering",
    "core.notifications",
    "core.orgsettings",
    "core.workflow",
    # ماژول‌های تجاری (با لایسنس فعال می‌شوند)
    "modules.personnel",
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    *NIKYAR_APPS,
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# پایگاه داده: در محیط واقعی PostgreSQL، در توسعه SQLite
if env("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB"),
            "USER": env("POSTGRES_USER", "nikyar"),
            "PASSWORD": env("POSTGRES_PASSWORD", ""),
            "HOST": env("POSTGRES_HOST", "localhost"),
            "PORT": env("POSTGRES_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "fa"
TIME_ZONE = "Asia/Tehran"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# فایل‌های ساخته‌شده‌ی فرانت‌اند (در نسخه‌ی Docker، کنار بک‌اند سرو می‌شوند)
FRONTEND_DIST = Path(env("NIKYAR_FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist")))
if FRONTEND_DIST.exists():
    WHITENOISE_ROOT = FRONTEND_DIST

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "EXCEPTION_HANDLER": "core.kernel.api.exception_handler_fa",
    "DEFAULT_THROTTLE_RATES": {"anon": "60/min"},
}

CORS_ALLOWED_ORIGINS = [o for o in env("NIKYAR_CORS_ORIGINS", "http://localhost:5173").split(",") if o]

MEDIA_URL = "media/"
MEDIA_ROOT = Path(env("NIKYAR_MEDIA_ROOT", str(BASE_DIR / "media")))
DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

# فایل لایسنس: فهرست ماژول‌های خریداری‌شده‌ی مشتری
NIKYAR_LICENSE_FILE = env("NIKYAR_LICENSE_FILE", str(BASE_DIR / "license.json"))
