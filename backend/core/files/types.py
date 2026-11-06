"""
نوع‌های فایل مجاز. نوع هر فایل از محتوای واقعی‌اش (امضای ابتدای فایل) تشخیص داده می‌شود، نه از پسوند یا
Content-Type مرورگر؛ پس فایل اجرایی با پسوند ‎.pdf پذیرفته نمی‌شود. SVG و HTML عمداً در فهرست نیستند
(می‌توانند اسکریپت اجرا کنند).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class FileType:
    extension: str
    label: str
    mime: str
    # امضاهای ممکن ابتدای فایل؛ None یعنی متن ساده (بدون بایت صفر).
    signatures: tuple[bytes, ...] | None
    # قابل نمایش در مرورگر (پیش‌نمایش تصویر و PDF)
    inline: bool = False


_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_ZIP = b"PK\x03\x04"

FILE_TYPES: dict[str, FileType] = {
    t.extension: t
    for t in [
        FileType("pdf", "PDF", "application/pdf", (b"%PDF-",), inline=True),
        FileType("jpg", "تصویر JPEG", "image/jpeg", (b"\xff\xd8\xff",), inline=True),
        FileType("jpeg", "تصویر JPEG", "image/jpeg", (b"\xff\xd8\xff",), inline=True),
        FileType("png", "تصویر PNG", "image/png", (b"\x89PNG\r\n\x1a\n",), inline=True),
        FileType("webp", "تصویر WebP", "image/webp", (b"RIFF",), inline=True),
        FileType("gif", "تصویر GIF", "image/gif", (b"GIF87a", b"GIF89a"), inline=True),
        FileType("docx", "Word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", (_ZIP,)),
        FileType("xlsx", "Excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", (_ZIP,)),
        FileType("pptx", "PowerPoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", (_ZIP,)),
        FileType("doc", "Word قدیمی", "application/msword", (_OLE,)),
        FileType("xls", "Excel قدیمی", "application/vnd.ms-excel", (_OLE,)),
        FileType("zip", "فشرده‌ی ZIP", "application/zip", (_ZIP,)),
        FileType("txt", "متن ساده", "text/plain; charset=utf-8", None),
        FileType("csv", "CSV", "text/csv; charset=utf-8", None),
    ]
}

IMAGE_EXTENSIONS = ("jpg", "jpeg", "png", "webp")
DEFAULT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "docx", "xlsx", "doc", "xls", "zip", "txt"]


def extension_of(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def content_matches(file_type: FileType, head: bytes) -> bool:
    if file_type.signatures is None:
        return b"\x00" not in head
    if file_type.extension == "webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    return any(head.startswith(sig) for sig in file_type.signatures)
