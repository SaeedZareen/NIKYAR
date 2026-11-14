"""
اجرای نیک‌یار برای استفاده در شبکه‌ی محلی (رایانه‌ها و موبایل‌های همان شبکه).

    python serve.py              درگاه پیش‌فرض ۸۰۰۰
    python serve.py --port 8080

رابط کاربری ساخته‌شده (frontend/dist) و API هر دو از همین درگاه سرو می‌شوند.
"""

import argparse
import os
import socket
import sys


def lan_addresses() -> list[str]:
    """نشانی‌های IPv4 این رایانه در شبکه‌ی محلی."""
    found: set[str] = set()
    try:
        # اتصال UDP بسته‌ای نمی‌فرستد؛ فقط کارت شبکه‌ی اصلی را مشخص می‌کند.
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            found.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    return sorted(a for a in found if not a.startswith("127."))


def main() -> None:
    parser = argparse.ArgumentParser(description="NIKYAR LAN server")
    parser.add_argument("--port", type=int, default=int(os.environ.get("NIKYAR_PORT", 8000)))
    parser.add_argument("--threads", type=int, default=16)
    args = parser.parse_args()

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.conf import settings
    from waitress import serve

    from config.wsgi import application
    from core.jobs.worker import start_in_background
    from core.setup import service as setup

    if not (settings.FRONTEND_DIST / "index.html").exists():
        sys.exit("Frontend is not built. Run install.bat first.")

    # پیام‌های کنسول انگلیسی‌اند: کنسول ویندوز متن فارسی را وارونه و جدا نشان می‌دهد.
    print("\nNIKYAR is running.")
    print(f"  On this computer:        http://localhost:{args.port}")
    for ip in lan_addresses():
        print(f"  From other devices (LAN): http://{ip}:{args.port}")
    print("Background jobs (daily backup, cleanup) run in this window too.")
    print("Press Ctrl+C to stop.\n", flush=True)
    if setup.needed():
        # فقط کسی که پنجره‌ی سرور را می‌بیند کد را می‌داند؛ جادوگر بی آن پایان نمی‌یابد
        print("First-run setup: open the address above in a browser and enter this setup code:")
        print(f"  {setup.code()}\n", flush=True)

    start_in_background()

    serve(application, listen=f"0.0.0.0:{args.port}", threads=args.threads, ident="NIKYAR")


if __name__ == "__main__":
    main()
