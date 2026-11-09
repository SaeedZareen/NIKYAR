"""نوع‌های صوتی تازه (برای فیلد «صدا»ی فرم‌ساز) در نصب‌های موجود هم مجاز می‌شوند؛ مدیر می‌تواند دوباره ببندد."""

from django.db import migrations

AUDIO = ["mp3", "m4a", "ogg", "wav", "webm"]


def enable(apps, schema_editor):
    SettingsValue = apps.get_model("settings", "SettingsValue")
    row = SettingsValue.objects.filter(section="files").first()
    if row and isinstance(row.values.get("allowed_extensions"), list):
        row.values["allowed_extensions"] = [*row.values["allowed_extensions"], *(e for e in AUDIO if e not in row.values["allowed_extensions"])]
        row.save(update_fields=["values"])


class Migration(migrations.Migration):
    dependencies = [("files", "0001_initial"), ("settings", "0001_initial")]
    operations = [migrations.RunPython(enable, migrations.RunPython.noop)]
