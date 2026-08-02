# Generated manually to match Django 5.1.4 autodetector output
# (system Python here lacks project deps to run makemigrations directly —
# see backend/requirements.txt; pattern copied from 0034_productrevaluation.py)

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('accounting', '0034_productrevaluation'),
    ]

    operations = [
        migrations.CreateModel(
            name='PriceChangeHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(db_index=True, verbose_name='Дата изменения')),
                ('old_price', models.DecimalField(decimal_places=2, max_digits=15, verbose_name='Старая цена')),
                ('new_price', models.DecimalField(decimal_places=2, max_digits=15, verbose_name='Новая цена')),
                ('quantity_at_change', models.DecimalField(decimal_places=3, max_digits=15, verbose_name='Остаток на момент изменения')),
                ('old_sum', models.DecimalField(decimal_places=2, max_digits=18, verbose_name='Сумма по старой цене')),
                ('new_sum', models.DecimalField(decimal_places=2, max_digits=18, verbose_name='Сумма по новой цене')),
                ('diff_amount', models.DecimalField(decimal_places=2, max_digits=18, verbose_name='Разница (прибыль/убыток)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='price_change_history', to='accounting.product', verbose_name='Товар')),
                ('price_type', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='change_history', to='accounting.pricetype', verbose_name='Тип цены (пусто = себестоимость)')),
                ('product_price', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='change_history', to='accounting.productprice', verbose_name='Строка цены-основания')),
                ('warehouse', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='price_change_history', to='accounting.warehouse', verbose_name='Склад (если цена привязана к складу)')),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='price_change_history', to='accounting.branch', verbose_name='Филиал (если цена привязана к филиалу)')),
                ('document', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='price_change_history', to='accounting.document', verbose_name='Документ-основание (для себестоимости)')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='price_change_history', to=settings.AUTH_USER_MODEL, verbose_name='Кто изменил')),
            ],
            options={
                'verbose_name': 'История изменения цены',
                'verbose_name_plural': 'История изменения цен',
                'ordering': ['-date', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='pricechangehistory',
            index=models.Index(fields=['product', 'date'], name='pricehist_product_date_idx'),
        ),
        migrations.AddIndex(
            model_name='pricechangehistory',
            index=models.Index(fields=['price_type', 'date'], name='pricehist_type_date_idx'),
        ),
    ]
