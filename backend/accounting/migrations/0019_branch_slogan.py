from django.db import migrations, models

DEFAULT_SLOGAN = "Işiňiz haýyrly we bereketli bolsun!"


def set_default_slogan(apps, schema_editor):
    Branch = apps.get_model('accounting', 'Branch')
    Branch.objects.filter(slogan='').update(slogan=DEFAULT_SLOGAN)


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0018_documentparticipant_role_freetext'),
    ]

    operations = [
        migrations.AddField(
            model_name='branch',
            name='slogan',
            field=models.TextField(blank=True, max_length=256, verbose_name='Слоган филиала'),
        ),
        migrations.RunPython(set_default_slogan, reverse_noop),
    ]
