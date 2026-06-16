# / backend/accounting/models.py
import uuid
import os

from django.db import connection, models
from django.contrib.contenttypes.models import ContentType
from django.contrib.postgres.indexes import GinIndex  # Наше секретное оружие для JSON
from django.core.exceptions import ValidationError
from utils.validators import validate_image_size

from imagekit.models import ImageSpecField
from imagekit.processors import ResizeToFill
from PIL import Image
import os



# =====================================================================
# УНИВЕРСАЛЬНЫЙ ГЕНЕРАТОР ПУТЕЙ
# =====================================================================
def get_company_file_path(instance, filename, folder_type):
    """Универсальная функция для всех файлов CompanyProfile"""
    ext = filename.split('.')[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    folder_id = instance.pk if instance.pk else uuid.uuid4()
    return f'{connection.schema_name}/company_{folder_type}/{folder_id}/{filename}'

# --- Теперь функции выглядят так ---
def company_logo_directory_path(instance, filename):
    return get_company_file_path(instance, filename, 'logos')

def company_logo2_directory_path(instance, filename):
    return get_company_file_path(instance, filename, 'logos2')

def stamps_directory_path(instance, filename):
    return get_company_file_path(instance, filename, 'stamps')

def signature_directory_path(instance, filename):
    return get_company_file_path(instance, filename, 'signatures')
    
# ==============================================================================
# МОДЕЛЬ ПРОФИЛЯ КОМПАНИИ
# ==============================================================================

class CompanyProfile(models.Model):
    """
    Модель для хранения юридической и операционной информации о компании (тенанте).
    Данные используются для автоматической генерации печатных форм документов (счетов, актов).
    """

    # --- Брендинг ---
    # Официальное краткое название компании для отображения в интерфейсе и документах.
    name = models.CharField(max_length=255, null=True, blank=True)
    
    # Файл логотипа: отображается в шапке всех исходящих документов.
    logo = models.ImageField(upload_to=company_logo_directory_path, blank=True, null=True, validators=[validate_image_size])
    logo_thumbnail = ImageSpecField(source='logo', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})
    
    logo2 = models.ImageField(upload_to=company_logo2_directory_path, blank=True, null=True, validators=[validate_image_size])
    logo2_thumbnail = ImageSpecField(source='logo2', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})
    
    # Изображение печати: прозрачный PNG, накладываемый на документы для придания им юридической силы.
    stamp_image = models.ImageField(upload_to=stamps_directory_path, blank=True, null=True, validators=[validate_image_size])
    stamp_image_thumbnail = ImageSpecField(source='stamp_image', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})
    
    # Изображение подписи: скан подписи руководителя для автоматической подстановки в счета и акты.
    signature_image = models.ImageField(upload_to=signature_directory_path, blank=True, null=True, validators=[validate_image_size])
    signature_image_thumbnail = ImageSpecField(source='signature_image', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})

    # --- Юридические реквизиты ---
    # ИНН (Идентификационный номер налогоплательщика): уникальный код компании в системе налогообложения.
    tax_id = models.CharField(max_length=50, null=True, blank=True) 
    
    # Полное наименование банка, в котором открыт расчетный счет.
    bank_name = models.CharField(max_length=255, null=True, blank=True)
    
    # Номер расчетного счета компании (20-значный номер для банковских переводов).
    bank_account = models.CharField(max_length=50, null=True, blank=True)
    
    # МФО (Межбанковский финансовый оборот): код банка для идентификации транзакций.
    mfo = models.CharField(max_length=10, null=True, blank=True)
    
    # Дата официальной регистрации компании в государственных органах.
    legal_reg_date = models.DateField(null=True, blank=True)
    
    # Физический юридический адрес компании для указания в реквизитах сторон.
    address = models.TextField(null=True, blank=True)

    # --- Ответственные лица ---
    # ФИО руководителя компании (используется для подписи в договорах).
    director_name = models.CharField(max_length=255, null=True, blank=True)
    
    # ФИО главного бухгалтера (необходимо для отображения в строке ответственных лиц в счетах-фактурах).
    chief_accountant_name = models.CharField(max_length=255, null=True, blank=True)

    # --- Контакты ---
    # Основной рабочий телефон компании.
    phone_official = models.CharField(max_length=30, null=True, blank=True)
    # Запасной или дополнительный телефон (например, номер отдела продаж или бухгалтерии).
    phone_official2 = models.CharField(max_length=30, null=True, blank=True)
    
    # Официальный Email компании для получения счетов и переписки.
    email_official = models.EmailField(null=True, blank=True)
    # Дополнительный Email (например, для налоговой отчетности).
    email_official2 = models.EmailField(null=True, blank=True)
    
    # Основной сайт компании.
    website = models.URLField(null=True, blank=True)
    # Запасной сайт или страница в соцсетях.
    website2 = models.URLField(null=True, blank=True)

    # --- Настройки системы ---
    # Основная валюта учета (например, 'TMT'). Используется во всех финансовых расчетах.
    base_currency = models.CharField(max_length=10, default="TMT")

    def save(self, *args, **kwargs):
        # Логика удаления файлов (лого, печать, подпись) при обновлении
        if self.pk:
            try:
                old_profile = CompanyProfile.objects.get(pk=self.pk)
                # Список полей-файлов для проверки
                file_fields = ['logo', 'logo2', 'stamp_image', 'signature_image']
                for field_name in file_fields:
                    old_file = getattr(old_profile, field_name)
                    new_file = getattr(self, field_name)
                    if old_file and old_file != new_file:
                        if os.path.isfile(old_file.path):
                            os.remove(old_file.path)
            except CompanyProfile.DoesNotExist:
                pass
        super().save(*args, **kwargs)
            
        if self.logo:
            img = Image.open(self.logo.path)
            # Если картинка слишком большая по ширине, уменьшим её до 1000px (этого хватит для всего)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            
            # Сжимаем качество, чтобы файл весил мало, но выглядел хорошо
            img.save(self.logo.path, optimize=True, quality=85)
            
        if self.logo2:
            img = Image.open(self.logo2.path)
            # Если картинка слишком большая по ширине, уменьшим её до 1000px (этого хватит для всего)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            
            # Сжимаем качество, чтобы файл весил мало, но выглядел хорошо
            img.save(self.logo2.path, optimize=True, quality=85)
            
        # if self.stamp_image:
        #     img = Image.open(self.stamp_image.path)
        #     # Если картинка слишком большая по ширине, уменьшим её до 1000px (этого хватит для всего)
        #     if img.width > 1000:
        #         img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            
        #     # Сжимаем качество, чтобы файл весил мало, но выглядел хорошо
        #     img.save(self.stamp_image.path, optimize=True, quality=85)
        
        if self.stamp_image:
            img = Image.open(self.stamp_image.path)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            # Сохраняем как PNG чтобы не потерять прозрачность
            img.save(self.stamp_image.path, format='PNG', optimize=True)
            
        if self.signature_image:
            img = Image.open(self.signature_image.path)
            # Если картинка слишком большая по ширине, уменьшим её до 1000px (этого хватит для всего)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            
            # Сжимаем качество, чтобы файл весил мало, но выглядел хорошо
            img.save(self.signature_image.path, optimize=True, quality=85)
        
    
class Branch(models.Model):
    
    # --- Основные ---
    name = models.CharField(max_length=255, verbose_name="Название филиала")
    code = models.CharField(max_length=20, verbose_name="Код филиала", blank=True)
    is_head_office = models.BooleanField(default=False, verbose_name="Главный офис")
    
    # --- Контакты ---
    address = models.TextField(blank=True, verbose_name="Адрес филиала")
    city = models.CharField(max_length=100, blank=True, verbose_name="Город")
    phone = models.CharField(max_length=30, blank=True, verbose_name="Телефон филиала")
    email = models.EmailField(blank=True, verbose_name="Email филиала")
    website = models.URLField(blank=True, verbose_name="Сайт филиала")

    # --- Ответственные ---
    manager_name = models.CharField(max_length=255, blank=True, verbose_name="Управляющий")
    manager_position = models.CharField(max_length=255, default="Директор филиала", verbose_name="Должность")

    # --- Изображения с миниатюрами ---
    logo = models.ImageField(upload_to='logos/branches/', blank=True, null=True)
    logo_thumbnail = ImageSpecField(source='logo', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})
    
    signature_image = models.ImageField(upload_to='signatures/branches/', blank=True, null=True)
    signature_image_thumbnail = ImageSpecField(source='signature_image', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})

    company_profile = models.ForeignKey('CompanyProfile', on_delete=models.CASCADE, related_name='branches')
    
    is_active = models.BooleanField(default=True, verbose_name="Активен")

    def save(self, *args, **kwargs):
        # 1. Логика удаления старых файлов при обновлении
        if self.pk:
            try:
                old_branch = Branch.objects.get(pk=self.pk)
                file_fields = ['logo', 'signature_image']
                for field_name in file_fields:
                    old_file = getattr(old_branch, field_name)
                    new_file = getattr(self, field_name)
                    if old_file and old_file != new_file:
                        if os.path.isfile(old_file.path):
                            os.remove(old_file.path)
            except Branch.DoesNotExist:
                pass

        super().save(*args, **kwargs)

        # 2. Обработка логотипа
        if self.logo:
            img = Image.open(self.logo.path)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            img.save(self.logo.path, optimize=True, quality=85)

        # 3. Обработка подписи
        if self.signature_image:
            img = Image.open(self.signature_image.path)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            img.save(self.signature_image.path, optimize=True, quality=85)

    class Meta:
        verbose_name = "Филиал"
        verbose_name_plural = "Филиалы"
    







# =====================================================================
# 1. СПРАВОЧНИКИ И НАСТРОЙКИ ПЛАНА СЧЕТОВ
# =====================================================================
class Directory(models.Model):
    """Тип справочника, созданный пользователем"""
    name = models.CharField(max_length=255)        # "Контрагенты"
    slug = models.SlugField(unique=True)            # "kontragenty"
    icon = models.CharField(max_length=50, blank=True)  # emoji или имя иконки
    color = models.CharField(max_length=7, default="#3b82f6")
    
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Справочник"
        
        
class DirectoryField(models.Model):
    """Поля справочника"""
    class FieldType(models.TextChoices):
        TEXT    = 'text',    'Текст'
        NUMBER  = 'number',  'Число'
        DATE    = 'date',    'Дата'
        BOOLEAN = 'boolean', 'Да/Нет'
        REF     = 'ref',     'Ссылка на другой справочник'

    directory = models.ForeignKey(Directory, on_delete=models.CASCADE, related_name='fields')
    name       = models.CharField(max_length=100)   # "ИНН"
    slug       = models.SlugField()                  # "inn"
    field_type = models.CharField(max_length=20, choices=FieldType.choices, default=FieldType.TEXT)
    ref_directory = models.ForeignKey(
        Directory, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )  # Только для field_type = 'ref'
    is_required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']
        unique_together = ('directory', 'slug')
        
        
class DirectoryRecord(models.Model):
    """Запись в справочнике"""
    directory  = models.ForeignKey(Directory, on_delete=models.CASCADE, related_name='records')
    name       = models.CharField(max_length=255)   # Основное поле "Название"
    data       = models.JSONField(default=dict)      # Все остальные поля
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Запись справочника"
        
        

class SubcontoType(models.Model):
    """
    Виды субконто (Паспорт аналитики).
    """
    name = models.CharField(max_length=100, unique=True, verbose_name="Название аналитики")
    
    # Системный идентификатор (например: 'kontragenty', 'nomenklatura', 'sklady')
    # Используется как ключ в JSON-проводках для сквозных отчетов
    slug = models.SlugField(max_length=50, unique=True, verbose_name="Системный код (Slug)")
    
    directory = models.ForeignKey(
        Directory, on_delete=models.SET_NULL,
        null=True, blank=True,
        verbose_name="Динамический справочник"
    )
    
    content_type = models.ForeignKey(
        ContentType, 
        on_delete=models.PROTECT,  # Защищаем модели справочников от случайного удаления
        verbose_name="Какую модель подключаем",
        limit_choices_to=models.Q(app_label='accounting') | models.Q(app_label='companies') | models.Q(app_label='users')
    )

    class Meta:
        verbose_name = "Вид субконто"
        verbose_name_plural = "Виды субконто"

    def __str__(self):
        return f"{self.name} ({self.slug})"
    
    

class Account(models.Model):
    """
    План счетов с жесткой защитой иерархии.
    """
    
    class AccountType(models.TextChoices):
        ACTIVE = 'A', 'А'
        PASSIVE = 'P', 'П'
        ACTIVE_PASSIVE = 'AP', 'АП'
        
    code = models.CharField(max_length=10, unique=True, verbose_name="Код счета")
    name = models.CharField(max_length=255, verbose_name="Наименование счета")

    
    # КРИТИЧЕСКИЙ НЮАНС: Меняем SET_NULL на PROTECT. 
    # Нельзя удалить родительский счет, пока живы его субсчета!
    parent = models.ForeignKey(
        'self', 
        on_delete=models.PROTECT, 
        null=True, 
        blank=True, 
        related_name='subaccounts',
        verbose_name="Родительский счет"
    )
    
    is_group = models.BooleanField(default=False, verbose_name="Это группа (нельзя делать проводки)")
    
    subcontos = models.ManyToManyField(
        SubcontoType, 
        through='AccountSubconto', 
        related_name='accounts',
        verbose_name="Виды субконто"
    )
    

    account_type = models.CharField(
        max_length=2, 
        choices=AccountType.choices, 
        default=AccountType.ACTIVE_PASSIVE,
        verbose_name="Вид счета"
    )
    
    is_active = models.BooleanField(default=True, verbose_name="Активен")

    class Meta:
        ordering = ['code']
        verbose_name = "Счет"
        verbose_name_plural = "План счетов"

    def __str__(self):
        return f"{self.code} - {self.name}"


class AccountSubconto(models.Model):
    """
    Связующая таблица для определения порядка вывода субконто в UI.
    """
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='account_subcontos')
    subconto_type = models.ForeignKey(SubcontoType, on_delete=models.CASCADE, verbose_name="Вид субконто")
    order = models.PositiveIntegerField(default=1, verbose_name="Порядок вывода в интерфейсе (1, 2, 3)")

    class Meta:
        unique_together = ('account', 'order')
        ordering = ['order']
        verbose_name = "Субконто счета"
        verbose_name_plural = "Субконто счетов"
        
        
# =====================================================================
# 2. ДВИЖОК ПРОВОДОК С ИНДЕКСАЦИЕЙ JSON
# =====================================================================

class JournalEntry(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        POSTED = 'posted', 'Проведен'
        
    number = models.CharField(max_length=20, unique=True, verbose_name="Номер операции")
    date = models.DateTimeField(db_index=True, verbose_name="Дата проводки") # Индекс для фильтрации по датам/периодам
    
    status = models.CharField(
        max_length=10, 
        choices=Status.choices, 
        default=Status.DRAFT, 
        db_index=True, # Индекс нужен, чтобы быстро фильтровать только проведенные (POSTED)
        verbose_name="Статус операции"
    )
    
    description = models.CharField(max_length=255, blank=True, verbose_name="Содержание / Комментарий")
    
    source_document_id = models.PositiveIntegerField(null=True, blank=True, verbose_name="ID документа-источника")
    source_document_type = models.ForeignKey(
        ContentType, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        verbose_name="Тип документа-источника"
    )
    
    
    # метод проверки баланса, сумма всех дебетов равна сумме всех кредитов внутри одной
    def check_balance(self):
        total_dt = self.transactions.aggregate(models.Sum('amount'))['amount__sum'] or 0
        total_kt = self.transactions.aggregate(models.Sum('amount'))['amount__sum'] or 0
        if total_dt != total_kt:
            raise ValidationError("Сумма Дт не равна Кт!")

    class Meta:
        ordering = ['-date', '-number']
        verbose_name = "Операция"
        verbose_name_plural = "Журнал операций"

    def __str__(self):
        return f"Операция №{self.number} от {self.date.strftime('%d.%m.%Y')}"


class Transaction(models.Model):
    journal_entry = models.ForeignKey(
        JournalEntry, 
        on_delete=models.CASCADE, 
        related_name='transactions',
        verbose_name="Родительская операция"
    )
    
    account_deb = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='debit_transactions', verbose_name="Счет Дт")
    account_krt = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='credit_transactions', verbose_name="Счет Кт")
    
    amount = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Сумма")

    # НОВЫЙ ФОРМАТ ХРАНЕНИЯ: {"kontragenty": {"id": 5, "name": "ИП Ахмедов"}}
    subcontos_deb = models.JSONField(default=dict, blank=True, verbose_name="Субконто Дт (JSON)")
    subcontos_krt = models.JSONField(default=dict, blank=True, verbose_name="Субконто Кт (JSON)")
    
    
    
    def clean(self):
        # Запрет проводок по группам
        if self.account_deb.is_group:
            raise ValidationError("Нельзя проводить по счету-группе")
    
        """Валидация того, что JSON заполнен согласно требованиям плана счетов"""
        self._validate_subcontos(self.account_deb, self.subcontos_deb, "Дебет")
        self._validate_subcontos(self.account_krt, self.subcontos_krt, "Кредит")

    def _validate_subcontos(self, account, subcontos_json, side_name):
        # Получаем все требуемые slug-и субконто для этого счета
        required_subcontos = account.subcontos.values_list('slug', flat=True)
        
        # Проверяем наличие всех обязательных ключей в переданном JSON
        for slug in required_subcontos:
            if slug not in subcontos_json:
                raise ValidationError(
                    {f"subcontos_{side_name.lower()}": f"Для счета {account.code} обязательно заполнение аналитики: {slug}"}
                )
        
        # Опционально: проверка на лишние ключи (если в JSON прислали то, чего не должно быть на счете)
        for slug in subcontos_json.keys():
            if slug not in required_subcontos:
                raise ValidationError(
                    {f"subcontos_{side_name.lower()}": f"Аналитика {slug} не предусмотрена для счета {account.code}"}
                )

    def save(self, *args, **kwargs):
        # Вызываем clean перед сохранением, так как Django save() не вызывает clean() автоматически
        self.full_clean()
        super().save(*args, **kwargs)
        

    class Meta:
        verbose_name = "Проводка"
        verbose_name_plural = "Проводки"
        
        # КРИТИЧЕСКИЙ НЮАНС: Вешаем инвертированные GIN-индексы на JSON-поля.
        # Это позволит Postgres мгновенно искать совпадения внутри JSON структур
        indexes = [
            GinIndex(fields=['subcontos_deb'], name='tx_subcontos_deb_gin'),
            GinIndex(fields=['subcontos_krt'], name='tx_subcontos_krt_gin'),
        ]

    def __str__(self):
        return f"Дт {self.account_deb.code} - Кт {self.account_krt.code} на сумму {self.amount}"
    
    



# =====================================================================
# 3. Базовые моделки с базовыми полями
# =====================================================================

class ProductCategory(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Категория товара"
        verbose_name_plural = "Категории товаров"

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Бренд"
        verbose_name_plural = "Бренды"

    def __str__(self):
        return self.name


class Tag(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name = "Тег"
        verbose_name_plural = "Теги"

    def __str__(self):
        return self.name


class Unit(models.Model):
    """Единица измерения: шт, кг, л, м..."""
    name = models.CharField(max_length=50)
    short_name = models.CharField(max_length=10)  # "шт", "кг"

    class Meta:
        verbose_name = "Единица измерения"
        verbose_name_plural = "Единицы измерения"

    def __str__(self):
        return self.short_name


class Product(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название товара")
    sku = models.CharField(max_length=100, unique=True, blank=True, null=True, verbose_name="Артикул")
    
    # Коды для сканирования
    barcode = models.CharField(max_length=100, unique=True, blank=True, null=True, verbose_name="Штрихкод (EAN-13)")
    qr_code = models.CharField(max_length=255, unique=True, blank=True, null=True, verbose_name="QR-код / Серийный номер")

    category = models.ForeignKey(ProductCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='products', verbose_name="Категория")
    brand = models.ForeignKey(Brand, on_delete=models.SET_NULL, null=True, blank=True, related_name='products', verbose_name="Бренд")
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, null=True, related_name='products', verbose_name="Единица измерения")
    tags = models.ManyToManyField(Tag, blank=True, related_name='products', verbose_name="Теги")

    price_retail = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Цена розница")
    price_wholesale = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Цена опт")
    cost_price = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Себестоимость")

    # Система проверяет: остаток на складе (5) < min_stock_level (10). Если условие верно — система сигнализирует: «Пора заказать!».
    min_stock_level = models.IntegerField(default=0, verbose_name="Мин. остаток для заказа")
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")

    extra_data = models.JSONField(default=dict, blank=True, verbose_name="Доп. данные")

    class Meta:
        verbose_name = "Товар"
        verbose_name_plural = "Товары"
        indexes = [
            GinIndex(fields=['extra_data'], name='product_extra_data_gin'),
            models.Index(fields=['barcode'], name='product_barcode_idx'),
            models.Index(fields=['qr_code'], name='product_qr_code_idx'),
            models.Index(fields=['name'], name='product_name_idx'),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku})"


class CounterpartyManager(models.Manager):
    """Кастомный менеджер для удобной фильтрации контрагентов"""
    
    def clients(self):
        # Возвращаем только тех, кто является Клиентом или И тем, и другим
        return self.filter(type__in=['client', 'both'])

    def suppliers(self):
        # Возвращаем только тех, кто является Поставщиком или И тем, и другим
        return self.filter(type__in=['supplier', 'both'])
    
    
class Counterparty(models.Model):
    class Type(models.TextChoices):
        CLIENT = 'client', 'Клиент'
        SUPPLIER = 'supplier', 'Поставщик'
        BOTH = 'both', 'Клиент и поставщик'

    name = models.CharField(max_length=255, verbose_name="Название контрагента")
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.BOTH)

    inn = models.CharField(max_length=20, blank=True, verbose_name="ИНН")
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    extra_data = models.JSONField(default=dict, blank=True)
    
    objects = CounterpartyManager()

    class Meta:
        verbose_name = "Контрагент"
        verbose_name_plural = "Контрагенты"
        indexes = [
            GinIndex(fields=['extra_data'], name='counterparty_extra_data_gin'),
        ]

    def __str__(self):
        return self.name


class Warehouse(models.Model):
    name = models.CharField(max_length=255)
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name='warehouses')
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_main = models.BooleanField(default=False, verbose_name="Основной склад")  # явный флаг вместо "если нет branch"

    class Meta:
        verbose_name = "Склад"

    def __str__(self):
        return self.name
    
    
class WarehouseStock(models.Model):
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='stocks')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stocks')
    quantity = models.DecimalField(max_digits=15, decimal_places=3, default=0)

    class Meta:
        unique_together = ('warehouse', 'product')
        verbose_name = "Остаток на складе"














    
    