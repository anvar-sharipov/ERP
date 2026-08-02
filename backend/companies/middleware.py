# companies/middleware.py
import os
from pathlib import Path

from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

ALWAYS_ALLOWED_PATHS = [
    '/api/companies/platform-contact/',
]

ALWAYS_ALLOWED_PREFIXES = [
    '/media/',
]

# ✅ Второй идентификатор (см. Company.allowed_hardware_id) — UUID материнской
# платы, пишется на хост вручную (контейнер не видит настоящее железо),
# монтируется read-only (см. docker-compose.yml).
HARDWARE_ID_FILE = Path('/app/hardware_id.txt')


def _read_hardware_id() -> str:
    try:
        return HARDWARE_ID_FILE.read_text(encoding='utf-8').strip().upper()
    except OSError:
        return ''


class TenantActiveCheckMiddleware(MiddlewareMixin):
    def process_request(self, request):
        tenant = getattr(request, 'tenant', None)

        if not tenant or tenant.schema_name == 'public':
            return None

        # Разрешаем публичные пути
        if request.path in ALWAYS_ALLOWED_PATHS:
            return None

        # Разрешаем медиафайлы
        if any(request.path.startswith(prefix) for prefix in ALWAYS_ALLOWED_PREFIXES):
            return None

        if hasattr(tenant, 'is_active') and not tenant.is_active:
            return JsonResponse(
                {
                    "detail": "Срок действия лицензии истёк. Обратитесь к администратору системы для продления.",
                    "detail": "LicenseExpiredMessage",
                    "code": "tenant_inactive",
                },
                status=403,
            )

        # ✅ Привязка к ПК (см. Company.pc_lock_enabled) — галочка выключена
        # (по умолчанию) — вообще не проверяем, работает всегда.
        # Оба сигнала ОБЯЗАТЕЛЬНЫ и оба должны совпасть (CompanyUpdateSerializer
        # не даст включить галочку, не заполнив оба поля — см. CompanySerializer.py):
        # 1) HOST_COMPUTERNAME — переменная окружения, которую Docker Compose
        #    сам подставляет из ${COMPUTERNAME} хоста (см. docker-compose.yml) —
        #    ничего дополнительно снимать на хосте не нужно, но легко меняется
        #    (переименовать ПК может любой пользователь за 10 секунд).
        # 2) allowed_hardware_id (UUID материнской платы) — "железнее",
        #    обычный пользователь о нём не знает и случайно не поменяет, но
        #    требует, чтобы hardware_id.txt был снят на хосте вручную (см.
        #    tools/licensing/collect_hardware_id.ps1).
        if getattr(tenant, 'pc_lock_enabled', False):
            host_computer_name = os.environ.get('HOST_COMPUTERNAME', '').strip().upper()
            allowed_name = (tenant.allowed_computer_name or '').strip().upper()
            name_ok = bool(host_computer_name) and bool(allowed_name) and host_computer_name == allowed_name

            allowed_hw = (tenant.allowed_hardware_id or '').strip().upper()
            hw_ok = bool(allowed_hw) and _read_hardware_id() == allowed_hw

            if not (name_ok and hw_ok):
                return JsonResponse(
                    {
                        "detail": "Программа не запущена на разрешённом компьютере. Обратитесь к администратору системы.",
                        "code": "tenant_inactive",
                    },
                    status=403,
                )
        return None

