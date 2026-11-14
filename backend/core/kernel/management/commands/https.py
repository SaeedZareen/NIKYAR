"""
HTTPS tool (https-tool.bat): show the state, use NIKYAR's own certificate, use the organisation's certificate
(PEM certificate + key, or a PFX file), or turn HTTPS off. Takes effect when NIKYAR starts again.
Console output is English (Windows consoles cannot render Persian).
"""

import getpass
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core.kernel import tls

RESTART = "Restart NIKYAR to apply: close and reopen start.bat, or service.bat option 4."


class Command(BaseCommand):
    help = "Show or change HTTPS for the local network."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="action", required=True)
        sub.add_parser("show", help="Show the HTTPS state.")
        own = sub.add_parser("self", help="Use NIKYAR's own certificate (each device installs nikyar-ca.crt once).")
        own.add_argument("--port", type=int, default=tls.DEFAULT_PORT)
        org = sub.add_parser("org", help="Use the organisation's certificate.")
        org.add_argument("--cert", help="PEM certificate (with intermediate certificates)")
        org.add_argument("--key", help="PEM private key without password")
        org.add_argument("--pfx", help="PFX/P12 file instead of --cert and --key")
        org.add_argument("--password", help="PFX password (asked if not given)")
        org.add_argument("--port", type=int, default=tls.DEFAULT_PORT)
        sub.add_parser("off", help="Turn HTTPS off (plain HTTP).")

    def handle(self, action, **options):
        try:
            getattr(self, f"do_{action}")(options)
        except (tls.TlsError, OSError) as e:
            raise CommandError(str(e)) from None

    def do_show(self, options):
        s = tls.status()
        if not s["enabled"]:
            self.stdout.write("HTTPS is off. NIKYAR uses plain HTTP.")
            return
        mode = "NIKYAR's own certificate" if s["mode"] == "self" else "the organisation's certificate"
        expires = f", valid until {s['expires']:%Y-%m-%d}" if s["expires"] else ""
        self.stdout.write(f"HTTPS is on (port {s['port']}) with {mode}{expires}.")
        if s["ca"]:
            self.stdout.write(f"Certificate for the devices: {tls.folder() / 'ca.pem'} (also at http://<server>:8000/nikyar-ca.crt)")

    def do_self(self, options):
        tls.save_config(True, "self", options["port"])
        cert, _ = tls.server_files()
        self.stdout.write(self.style.SUCCESS(f"HTTPS is on with NIKYAR's own certificate (port {options['port']})."))
        self.stdout.write(f"Install this file once on every computer and phone: {tls.folder() / 'ca.pem'}")
        self.stdout.write("Devices can also download it from http://<server>:8000/nikyar-ca.crt")
        self.stdout.write(RESTART)

    def do_org(self, options):
        if options["pfx"]:
            password = options["password"] if options["password"] is not None else getpass.getpass("PFX password: ")
            leaf = tls.install_pfx(Path(options["pfx"]).read_bytes(), password)
        elif options["cert"] and options["key"]:
            leaf = tls.install_org(Path(options["cert"]).read_bytes(), Path(options["key"]).read_bytes())
        else:
            raise CommandError("Give --cert and --key, or --pfx.")
        tls.save_config(True, "org", options["port"])
        self.stdout.write(self.style.SUCCESS(f"HTTPS is on with the organisation's certificate, valid until {leaf.not_valid_after_utc:%Y-%m-%d}."))
        self.stdout.write(RESTART)

    def do_off(self, options):
        cfg = tls.config()
        tls.save_config(False, cfg["mode"], cfg["port"])
        self.stdout.write(self.style.SUCCESS("HTTPS is off."))
        self.stdout.write(RESTART)
