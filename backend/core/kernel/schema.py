"""پس‌پردازش سند OpenAPI برای نوع‌های دقیق رابط کاربری."""


def require_response_fields(result, generator, request, public):
    """
    سریالایزرهای ما در پاسخ همیشه همه‌ی فیلدها را برمی‌گردانند؛ پس در طرح‌های پاسخ (نه درخواست)
    همه‌ی ویژگی‌ها الزامی علامت می‌خورند تا رابط کاربری با مقدار «شاید نباشد» سروکار نداشته باشد.
    """
    for name, schema in result.get("components", {}).get("schemas", {}).items():
        if name.endswith("Request") or schema.get("type") != "object" or "properties" not in schema:
            continue
        schema["required"] = sorted(schema["properties"])
    return result
