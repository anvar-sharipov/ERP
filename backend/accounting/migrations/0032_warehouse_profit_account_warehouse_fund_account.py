# Generated manually to match Django 5.1.4 autodetector output
# (system Python here lacks project deps to run makemigrations directly —
# see backend/requirements.txt; pattern copied from 0025_warehouse_discount_account.py)

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0031_alter_employee_user_agent_alter_counterparty_agent_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='warehouse',
            name='profit_account',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='warehouses_profit', to='accounting.account', verbose_name='Счёт прибыли (альт. схема)'),
        ),
        migrations.AddField(
            model_name='warehouse',
            name='fund_account',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='warehouses_fund', to='accounting.account', verbose_name='Счёт фонда прибыли (альт. схема)'),
        ),
    ]
