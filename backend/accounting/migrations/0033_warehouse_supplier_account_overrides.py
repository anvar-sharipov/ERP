# Generated manually to match Django 5.1.4 autodetector output
# (system Python here lacks project deps to run makemigrations directly —
# see backend/requirements.txt; pattern copied from 0025_warehouse_discount_account.py)

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0032_warehouse_profit_account_warehouse_fund_account'),
    ]

    operations = [
        migrations.AddField(
            model_name='warehouse',
            name='receivable_account_supplier',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='warehouses_receivable_supplier', to='accounting.account', verbose_name='Счёт расчётов с поставщиком (Расход)'),
        ),
        migrations.AddField(
            model_name='warehouse',
            name='payable_account_supplier',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='warehouses_payable_supplier_override', to='accounting.account', verbose_name='Счёт расчётов с поставщиком (Приход, альт.)'),
        ),
        migrations.AddField(
            model_name='warehouse',
            name='profit_account_supplier',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='warehouses_profit_supplier', to='accounting.account', verbose_name='Счёт прибыли для поставщика (альт. схема)'),
        ),
    ]
