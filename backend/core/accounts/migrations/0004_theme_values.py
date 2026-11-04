from django.db import migrations


def forwards(apps, schema_editor):
    Profile = apps.get_model("accounts", "Profile")
    Profile.objects.filter(theme__in=["graphite", "paper", ""]).update(theme="light")


class Migration(migrations.Migration):
    dependencies = [("accounts", "0003_theme_light_default")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
