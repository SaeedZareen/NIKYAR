from rest_framework import serializers

from core.messaging.sections import SecretField


class DirectorySettings(serializers.Serializer):
    """ورود با حساب ویندوز سازمان (Active Directory یا هر سرور LDAP)؛ مصرف: core.accounts.directory."""

    enabled = serializers.BooleanField(label="ورود با Active Directory", default=False)
    server_url = serializers.CharField(label="نشانی سرور", max_length=300, default="", allow_blank=True)
    start_tls = serializers.BooleanField(label="رمزگذاری با StartTLS", default=False)
    bind_user = serializers.CharField(label="حساب جست‌وجو", max_length=300, default="", allow_blank=True)
    bind_password = SecretField(label="گذرواژه‌ی حساب جست‌وجو")
    base_dn = serializers.CharField(label="ریشه‌ی جست‌وجو", max_length=300, default="", allow_blank=True)
    user_filter = serializers.CharField(label="فیلتر کاربر", max_length=300, default="(sAMAccountName={username})")
    allowed_groups = serializers.ListField(
        label="گروه‌های مجاز", child=serializers.CharField(max_length=500), default=list, help_text="DN گروه‌ها؛ خالی یعنی همه‌ی کاربران دامنه"
    )
    auto_create = serializers.BooleanField(label="ساخت خودکار کاربر", default=True)

    def validate_server_url(self, value):
        value = value.strip()
        if value and not value.lower().startswith(("ldap://", "ldaps://")):
            raise serializers.ValidationError("نشانی را با ldap:// یا ldaps:// بنویسید، مثل ldap://dc1.example.local")
        return value

    def validate_user_filter(self, value):
        value = value.strip()
        if "{username}" not in value or not (value.startswith("(") and value.endswith(")")):
            raise serializers.ValidationError("فیلتر باید در پرانتز باشد و {username} داشته باشد، مثل (sAMAccountName={username})")
        return value

    def validate_allowed_groups(self, value):
        return [g.strip() for g in value if g.strip()]

    def validate(self, attrs):
        if attrs.get("enabled"):
            missing = {
                "server_url": "نشانی سرور را وارد کنید.",
                "bind_user": "حساب جست‌وجو را وارد کنید.",
                "bind_password": "گذرواژه‌ی حساب جست‌وجو را وارد کنید.",
                "base_dn": "ریشه‌ی جست‌وجو را وارد کنید.",
            }
            errors = {k: m for k, m in missing.items() if not attrs.get(k)}
            if errors:
                raise serializers.ValidationError(errors)
        return attrs
