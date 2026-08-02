# backend/companies/models.py
from django.db import models
from django_tenants.models import TenantMixin, DomainMixin

class Company(TenantMixin):
    name = models.CharField(max_length=100)
    created_on = models.DateField(auto_now_add=True)
    
    is_active = models.BooleanField(default=True, verbose_name="Активна (оплачена)")

    # ✅ Привязка к конкретному ПК (см. companies/middleware.py) — управляется
    # прямо из global-admin панели (AdminPanel.tsx), без файлов/подписей.
    # Сверяется с переменной окружения HOST_COMPUTERNAME, которую Docker Compose
    # сам подставляет из ${COMPUTERNAME} хоста при "docker compose up" (см.
    # docker-compose.yml) — ничего дополнительно снимать на хосте не нужно.
    pc_lock_enabled = models.BooleanField(default=False, verbose_name="Работать только на указанном ПК")
    allowed_computer_name = models.CharField(max_length=64, blank=True, verbose_name="Разрешённое имя компьютера (COMPUTERNAME)")
    # ✅ Второй, более "железный" идентификатор — UUID материнской платы (см.
    # tools/licensing/collect_hardware_id.ps1). В отличие от имени ПК, о нём
    # обычный пользователь не знает и случайно не поменяет — переживает даже
    # переименование компьютера, меняется только при замене самой платы.
    # Читается из файла hardware_id.txt, который пишется на хосте вручную
    # (контейнер не видит настоящее железо), см. companies/middleware.py.
    allowed_hardware_id = models.CharField(max_length=128, blank=True, verbose_name="Разрешённый ID железа (UUID материнской платы)")

    # ✅ Управляется из global-admin панели (AdminPanel.tsx) — независимо от
    # обычных RBAC-прав ("branch", "POST") тенанта, скрывает/показывает кнопку
    # "Добавить филиал" (Branchs.tsx) для ВСЕХ пользователей этого tenant'а.
    # По умолчанию False — по запросу владельца платформы: добавлять филиалы
    # запрещено, пока явно не разрешено здесь для конкретной компании. Бэкенд
    # тоже проверяет это в BranchViewSet.perform_create — скрытая кнопка сама
    # по себе не блокирует прямой POST в API.
    allow_branch_creation = models.BooleanField(default=False, verbose_name="Разрешено добавлять филиалы")

    auto_create_schema = True # Чтобы схема создавалась сама
    

class Domain(DomainMixin):
    pass



class PlatformContact(models.Model):
    """
    Контактные данные владельца/администратора платформы.
    Показываются на экранах блокировки тенанта, страницах поддержки и т.д.
    Хранится только в public-схеме.
    """
    full_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    phone2 = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    telegram = models.CharField(max_length=100, blank=True)
    address = models.CharField(max_length=255, blank=True)
    photo = models.ImageField(upload_to='platform_contact/', blank=True, null=True)

    is_active = models.BooleanField(default=True)  # на случай если захочешь скрыть блок

    class Meta:
        verbose_name = "Platform Contact"
        verbose_name_plural = "Platform Contacts"

    def __str__(self):
        return self.full_name or "Platform Contact"