"""
ابزار مالک محصول برای لایسنس (راهنما: docs/LICENSE-GUIDE.md). پیام‌های کنسول انگلیسی‌اند.

    license keygen                ساخت کلید (یک‌بار): کلید خصوصی روی همین رایانه، کلید عمومی در مخزن
    license issue                 صدور لایسنس برای یک نصب (پرسش‌وپاسخ)
    license show <file>           نمایش و بررسی یک فایل لایسنس
"""

import getpass
import json
import uuid
from datetime import date, timedelta
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.kernel.registry import module_specs
from core.licensing.signing import PUBLIC_KEY_FILE, LicenseError, sign, verify

DEFAULT_KEY = Path.home() / "NIKYAR-license-key" / "nikyar-license.private.pem"


class Command(BaseCommand):
    help = "Owner tool: create the signing key, issue and inspect NIKYAR license files."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="action", required=True)
        keygen = sub.add_parser("keygen", help="Create the owner signing key pair (once).")
        keygen.add_argument("--key", type=Path, default=DEFAULT_KEY, help="Where to save the PRIVATE key (never inside the repository).")
        keygen.add_argument("--force", action="store_true", help="Replace an existing key (old licenses stop working).")
        issue = sub.add_parser("issue", help="Issue a license file for one installation.")
        issue.add_argument("--key", type=Path, default=DEFAULT_KEY)
        issue.add_argument("--install-id")
        issue.add_argument("--org")
        issue.add_argument("--users", type=int)
        issue.add_argument("--modules", help="Comma-separated module codes, or 'all'.")
        issue.add_argument("--until", help="Expiry date YYYY-MM-DD (Gregorian).")
        issue.add_argument("--days", type=int, help="Valid for N days from today (instead of --until).")
        issue.add_argument("--out", type=Path)
        show = sub.add_parser("show", help="Verify and print a license file.")
        show.add_argument("file", type=Path)

    def handle(self, *args, action, **opts):
        getattr(self, action)(**opts)

    # ---------------------------------------------------------------- keygen
    def keygen(self, key: Path, force: bool, **_):
        if key.exists() and not force:
            raise CommandError(
                f"Your signing key already exists at {key} - nothing is broken, you can issue licenses with it. "
                "To create a new one (only before issuing licenses; old licenses stop working), choose option 4 in the menu."
            )
        if key.resolve().is_relative_to(Path(__file__).resolve().parents[5]):
            raise CommandError("The private key must not be saved inside the NIKYAR folder (it could end up in the repository).")
        passphrase = self._new_passphrase()
        private = Ed25519PrivateKey.generate()
        encryption = serialization.BestAvailableEncryption(passphrase) if passphrase else serialization.NoEncryption()
        key.parent.mkdir(parents=True, exist_ok=True)
        key.write_bytes(private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, encryption))
        public = private.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        PUBLIC_KEY_FILE.write_bytes(public)
        self.stdout.write(self.style.SUCCESS(f"Private key saved to: {key}"))
        self.stdout.write("Keep it safe and make a backup copy (USB). Anyone with this file can issue licenses.")
        self.stdout.write(f"Public key written to: {PUBLIC_KEY_FILE}")
        self.stdout.write("Commit and push the public key so every installation can verify your licenses.")

    def _new_passphrase(self) -> bytes:
        """عبارت عبور دوبار پرسیده می‌شود؛ خالی گذاشتن فقط با تأیید صریح."""
        self.stdout.write("Choose a passphrase for the key. Nothing is shown while you type - that is normal.")
        while True:
            first = getpass.getpass("Passphrase: ")
            if not first:
                if input("No passphrase: anyone who copies the key file can issue licenses. Continue without one? (y/N): ").strip().lower() == "y":
                    return b""
                continue
            if getpass.getpass("Repeat the passphrase: ") == first:
                return first.encode()
            self.stdout.write(self.style.WARNING("The two passphrases are different. Try again."))

    # ---------------------------------------------------------------- issue
    def _load_key(self, key: Path) -> Ed25519PrivateKey:
        if not key.exists():
            raise CommandError(f"Private key not found at {key}. Run 'license keygen' first (or pass --key).")
        data = key.read_bytes()
        try:
            return serialization.load_pem_private_key(data, password=None)
        except TypeError:
            passphrase = getpass.getpass("Private key passphrase: ").encode()
            try:
                return serialization.load_pem_private_key(data, password=passphrase)
            except ValueError:
                raise CommandError("Wrong passphrase.") from None

    def _ask(self, value, prompt, cast=str):
        while value in (None, ""):
            value = input(prompt).strip()
        try:
            return cast(value)
        except ValueError:
            raise CommandError(f"Invalid value: {value}") from None

    def issue(self, key: Path, install_id, org, users, modules, until, days, out, **_):
        private = self._load_key(key)
        install_id = self._ask(install_id, "Installation ID (shown on the customer's 'Modules and license' page, or * for any): ")
        org = self._ask(org, "Organisation name: ")
        users = self._ask(users, "Maximum active users: ", int)
        known = [m.code for m in module_specs()]
        modules = self._ask(modules, f"Modules (comma-separated, 'all' or 'none'; available: {', '.join(known) or 'none yet'}): ")
        chosen = known if modules == "all" else [] if modules == "none" else [m.strip() for m in modules.split(",") if m.strip()]
        expires = timezone.localdate() + timedelta(days=days) if days else self._ask(until, "Valid until (YYYY-MM-DD): ", date.fromisoformat)
        payload = {
            "license_id": uuid.uuid4().hex[:12].upper(),
            "install_id": install_id,
            "org_name": org,
            "max_users": users,
            "modules": chosen,
            "issued_on": timezone.localdate().isoformat(),
            "expires_on": expires.isoformat(),
        }
        target = out or Path.cwd() / f"{install_id.replace('*', 'any')}.nikyar-license"
        target.write_text(sign(payload, private), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"License {payload['license_id']} written to: {target}"))
        self.stdout.write(f"  users: {users}  modules: {', '.join(chosen) or '(core only)'}  valid until: {expires}")
        self.stdout.write("Send this file to the customer; they upload it on 'Modules and license'.")

    # ---------------------------------------------------------------- show
    def show(self, file: Path, **_):
        try:
            data = verify(file.read_text(encoding="utf-8"))
        except LicenseError as e:
            raise CommandError(f"License is NOT valid: {e}") from None
        self.stdout.write(self.style.SUCCESS("Signature is valid."))
        self.stdout.write(json.dumps(data, ensure_ascii=False, indent=1))
