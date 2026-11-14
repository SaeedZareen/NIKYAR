"""
اجرای نیک‌یار برای استفاده در شبکه‌ی محلی (رایانه‌ها و موبایل‌های همان شبکه).

    python serve.py              درگاه پیش‌فرض ۸۰۰۰
    python serve.py --port 8080

رابط کاربری ساخته‌شده (frontend/dist) و API هر دو از همین درگاه سرو می‌شوند. اگر HTTPS روشن باشد
(https-tool.bat)، سامانه روی درگاه HTTPS (پیش‌فرض ۸۴۴۳) است و درگاه HTTP به آن هدایت می‌کند و گواهی ریشه‌ی
نیک‌یار را برای نصب روی دستگاه‌ها می‌دهد. سرور وب cheroot است (پشتیبانی HTTPS، روی ویندوز و لینوکس).
"""

import argparse
import os
import sys
import threading


def redirect_app(https_port: int, ca_file):
    """درگاه HTTP وقتی HTTPS روشن است: هر نشانی به همان نشانی روی HTTPS، جز گواهی ریشه برای نصب روی دستگاه‌ها."""

    def app(environ, start_response):
        if ca_file and environ.get("PATH_INFO") == "/nikyar-ca.crt" and ca_file.exists():
            body = ca_file.read_bytes()
            start_response("200 OK", [("Content-Type", "application/x-x509-ca-cert"), ("Content-Disposition", 'attachment; filename="nikyar-ca.crt"')])
            return [body]
        host = (environ.get("HTTP_HOST") or environ.get("SERVER_NAME", "localhost")).rsplit(":", 1)[0]
        query = environ.get("QUERY_STRING")
        target = f"https://{host}:{https_port}{environ.get('PATH_INFO', '/')}{'?' + query if query else ''}"
        start_response("301 Moved Permanently", [("Location", target), ("Content-Type", "text/plain")])
        return [b"NIKYAR uses HTTPS: " + target.encode()]

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="NIKYAR LAN server")
    parser.add_argument("--port", type=int, default=int(os.environ.get("NIKYAR_PORT", 8000)))
    parser.add_argument("--threads", type=int, default=16)
    args = parser.parse_args()

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from cheroot import wsgi
    from cheroot.ssl.builtin import BuiltinSSLAdapter
    from django.conf import settings

    from config.wsgi import application
    from core.jobs.worker import start_in_background
    from core.kernel import tls
    from core.setup import service as setup

    if not (settings.FRONTEND_DIST / "index.html").exists():
        sys.exit("Frontend is not built. Run install.bat first.")

    https = tls.config()
    servers = []
    if https["enabled"]:
        try:
            cert, key = tls.server_files()
        except tls.TlsError as e:
            sys.exit(f"[ERROR] {e}")
        secure = wsgi.Server(("0.0.0.0", https["port"]), application, numthreads=args.threads, server_name="NIKYAR")
        secure.ssl_adapter = BuiltinSSLAdapter(str(cert), str(key))
        ca = tls.folder() / "ca.pem" if https["mode"] == "self" else None
        servers = [secure, wsgi.Server(("0.0.0.0", args.port), redirect_app(https["port"], ca), numthreads=4, server_name="NIKYAR")]
        scheme, port = "https", https["port"]
    else:
        servers = [wsgi.Server(("0.0.0.0", args.port), application, numthreads=args.threads, server_name="NIKYAR")]
        scheme, port = "http", args.port

    # پیام‌های کنسول انگلیسی‌اند: کنسول ویندوز متن فارسی را وارونه و جدا نشان می‌دهد.
    print("\nNIKYAR is running.")
    print(f"  On this computer:        {scheme}://localhost:{port}")
    for ip in tls.lan_addresses():
        print(f"  From other devices (LAN): {scheme}://{ip}:{port}")
    if https["enabled"] and https["mode"] == "self":
        print(f"  Certificate for devices:  http://<address above>:{args.port}/nikyar-ca.crt")
    print("Background jobs (daily backup, cleanup) run in this window too.")
    print("Press Ctrl+C to stop.\n", flush=True)
    if setup.needed():
        # فقط کسی که پنجره‌ی سرور را می‌بیند کد را می‌داند؛ جادوگر بی آن پایان نمی‌یابد
        print("First-run setup: open the address above in a browser and enter this setup code:")
        print(f"  {setup.code()}\n", flush=True)

    start_in_background()
    for extra in servers[1:]:
        threading.Thread(target=extra.safe_start, daemon=True, name="nikyar-http-redirect").start()
    try:
        servers[0].safe_start()
    finally:
        for s in servers:
            s.stop()


if __name__ == "__main__":
    main()
