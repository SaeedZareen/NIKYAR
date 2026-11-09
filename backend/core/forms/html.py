"""
پاک‌سازی HTML متن غنی (پاسخ «متن غنی» و «متن راهنما»ی قالب‌دار) با nh3: فقط قالب‌بندی ساده می‌ماند
(پررنگ، کج، زیرخط، فهرست، پیوند، نقل‌قول، جدول ساده) و هر اسکریپت، رویداد و سبک حذف می‌شود.
"""

import html as _html

import nh3

TAGS = {"p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h3", "h4", "blockquote", "table", "thead", "tbody", "tr", "th", "td"}
ATTRIBUTES = {"a": {"href", "target"}, "td": {"colspan", "rowspan"}, "th": {"colspan", "rowspan"}}


def sanitize(value: str) -> str:
    """HTML امن؛ پیوندها در زبانه‌ی تازه و بی‌دسترسی به صفحه‌ی مبدأ باز می‌شوند."""
    return nh3.clean(
        value,
        tags=TAGS,
        attributes=ATTRIBUTES,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer",
        set_tag_attribute_values={"a": {"target": "_blank"}},
    ).strip()


def text_of(value: str) -> str:
    """متن خالص (برای «پر شده یا نه»)."""
    return _html.unescape(nh3.clean(value, tags=set())).replace("\xa0", " ").strip()
