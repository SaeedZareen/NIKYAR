#!/usr/bin/env python3
"""
ابزار لایسنس نیک‌یار (فقط برای فروشنده؛ کلید خصوصی را هرگز در مخزن نگذارید).

1) یک‌بار کلید بسازید:
       python tools/license_tool.py genkey --private ~/nikyar-private.pem
   کلید عمومی در backend/core/kernel/license_public.pem نوشته می‌شود؛ آن را commit کنید.

2) برای هر مشتری لایسنس امضا کنید:
       python tools/license_tool.py sign --private ~/nikyar-private.pem \
           --customer "شرکت نمونه" --modules personnel --max-users 200 --expires 1406/12/29 \
           --out license.json
   فایل license.json را به مشتری بدهید (در Docker: پوشه‌ی license/).
"""
import argparse
import base64
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "core" / "kernel" / "license_public.pem"
sys.path.insert(0, str(ROOT))


def canonical(payload):
    body = {k: v for k, v in payload.items() if k != "signature"}
    return json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def genkey(args):
    priv = Path(args.private).expanduser()
    if priv.exists():
        sys.exit(f"{priv} already exists; refusing to overwrite.")
    key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    priv.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                       serialization.NoEncryption()))
    priv.chmod(0o600)
    PUBLIC.write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM,
                                                     serialization.PublicFormat.SubjectPublicKeyInfo))
    print(f"private key: {priv}\npublic key:  {PUBLIC}")


def sign(args):
    key = serialization.load_pem_private_key(Path(args.private).expanduser().read_bytes(), password=None)
    payload = {"customer": args.customer, "modules": args.modules, "max_users": args.max_users, "expires": args.expires}
    sig = key.sign(canonical(payload), padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
                   hashes.SHA256())
    payload["signature"] = base64.b64encode(sig).decode()
    Path(args.out).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"written {args.out}")


p = argparse.ArgumentParser()
sub = p.add_subparsers(required=True)
g = sub.add_parser("genkey")
g.add_argument("--private", required=True)
g.set_defaults(fn=genkey)
s = sub.add_parser("sign")
s.add_argument("--private", required=True)
s.add_argument("--customer", required=True)
s.add_argument("--modules", nargs="*", default=[])
s.add_argument("--max-users", type=int, default=None)
s.add_argument("--expires", default=None)
s.add_argument("--out", default="license.json")
s.set_defaults(fn=sign)
a = p.parse_args()
a.fn(a)
