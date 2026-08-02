# Generated manually to match Django 5.1.4 autodetector output
# (system Python here lacks project deps to run makemigrations directly —
# see backend/requirements.txt; pattern copied from 0033_warehouse_supplier_account_overrides.py)

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('accounting', '0033_warehouse_supplier_account_overrides'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductRevaluation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(db_index=True, verbose_name='Дата документа-основания')),
                ('quantity', models.DecimalField(decimal_places=3, max_digits=15, verbose_name='Остаток на момент переоценки')),
                ('old_cost_price', models.DecimalField(decimal_places=2, max_digits=15, verbose_name='Себестоимость до')),
                ('new_cost_price', models.DecimalField(decimal_places=2, max_digits=15, verbose_name='Себестоимость после')),
                ('diff_amount', models.DecimalField(decimal_places=2, max_digits=18, verbose_name='Разница (дооценка/уценка)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='revaluations', to='accounting.product', verbose_name='Товар')),
                ('warehouse', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='revaluations', to='accounting.warehouse', verbose_name='Склад')),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='product_revaluations', to='accounting.branch', verbose_name='Филиал')),
                ('document', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='product_revaluations', to='accounting.document', verbose_name='Документ-основание')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='product_revaluations', to=settings.AUTH_USER_MODEL, verbose_name='Кто провёл документ-основание')),
            ],
            options={
                'verbose_name': 'Переоценка товара',
                'verbose_name_plural': 'Переоценки товаров',
                'ordering': ['-date', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='productrevaluation',
            index=models.Index(fields=['warehouse', 'date'], name='revaluation_warehouse_date_idx'),
        ),
        migrations.AddIndex(
            model_name='productrevaluation',
            index=models.Index(fields=['branch', 'date'], name='revaluation_branch_date_idx'),
        ),
        migrations.AddIndex(
            model_name='productrevaluation',
            index=models.Index(fields=['product', 'date'], name='revaluation_product_date_idx'),
        ),
    ]
