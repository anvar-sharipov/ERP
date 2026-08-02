import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from companies import middleware as companies_middleware
from companies.models import Company, Domain
from companies.serializers.CompanySerializer import CompanyUpdateSerializer

User = get_user_model()

BRANCHES_URL = '/api/accounting/branches/'


class PcLockMiddlewareTest(TenantTestCase):
    """
    TenantActiveCheckMiddleware — привязка к ПК (Company.pc_lock_enabled/
    allowed_computer_name), сверяется с переменной окружения HOST_COMPUTERNAME
    (см. docker-compose.yml — Docker Compose сам подставляет её из ${COMPUTERNAME}
    хоста).
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="PC Lock Co", schema_name="pclocktest", is_active=True)
        Domain.objects.create(domain='pclocktest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.superuser = User.objects.create_superuser(username="root", password="pass")

    def _client(self):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'pclocktest.localhost'
        client.force_authenticate(user=self.superuser)
        return client

    def test_lock_disabled_ignores_env_var(self):
        self.company.pc_lock_enabled = False
        self.company.allowed_computer_name = "SOME-OTHER-PC"
        self.company.save()

        with patch.dict(os.environ, {"HOST_COMPUTERNAME": "WHATEVER"}):
            response = self._client().get(BRANCHES_URL)
        self.assertEqual(response.status_code, 200)

    def test_lock_enabled_matching_name_passes(self):
        # ✅ Оба поля обязательны (см. CompanySerializer.py::validate) —
        # allowed_hardware_id тоже нужно заполнить и подложить совпадающий файл,
        # иначе middleware заблокирует именно из-за него.
        self.company.pc_lock_enabled = True
        self.company.allowed_computer_name = "DESKTOP-9CHMLPJ"
        self.company.allowed_hardware_id = "4C4C4544-0044-3410-8035-B4C04F435931"
        self.company.save()

        with self._with_hardware_file("4C4C4544-0044-3410-8035-B4C04F435931"):
            with patch.dict(os.environ, {"HOST_COMPUTERNAME": "desktop-9chmlpj"}):  # регистр не должен иметь значения
                response = self._client().get(BRANCHES_URL)
        self.assertEqual(response.status_code, 200)

    def test_lock_enabled_mismatched_name_blocks(self):
        self.company.pc_lock_enabled = True
        self.company.allowed_computer_name = "DESKTOP-9CHMLPJ"
        self.company.allowed_hardware_id = "4C4C4544-0044-3410-8035-B4C04F435931"
        self.company.save()

        with self._with_hardware_file("4C4C4544-0044-3410-8035-B4C04F435931"):
            with patch.dict(os.environ, {"HOST_COMPUTERNAME": "SOME-OTHER-PC"}):
                response = self._client().get(BRANCHES_URL)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'tenant_inactive')

    def test_lock_enabled_missing_env_var_blocks(self):
        self.company.pc_lock_enabled = True
        self.company.allowed_computer_name = "DESKTOP-9CHMLPJ"
        self.company.allowed_hardware_id = "4C4C4544-0044-3410-8035-B4C04F435931"
        self.company.save()

        env = dict(os.environ)
        env.pop("HOST_COMPUTERNAME", None)
        with self._with_hardware_file("4C4C4544-0044-3410-8035-B4C04F435931"):
            with patch.dict(os.environ, env, clear=True):
                response = self._client().get(BRANCHES_URL)
        self.assertEqual(response.status_code, 403)

    # ── Второй идентификатор (allowed_hardware_id) — оба должны совпасть ────

    def _with_hardware_file(self, content: str):
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8')
        tmp.write(content)
        tmp.close()
        self.addCleanup(lambda: Path(tmp.name).unlink(missing_ok=True))
        return patch.object(companies_middleware, 'HARDWARE_ID_FILE', Path(tmp.name))

    def test_hardware_id_blank_blocks_even_if_name_matches(self):
        # Оба поля обязательны при pc_lock_enabled=True (см. CompanySerializer.py
        # validate() — через API так сохранить не получится, но модель могла
        # оказаться в таком состоянии другим путём, например прямой правкой в
        # БД) — middleware должен блокировать, а не молча пропускать по одному
        # полю.
        self.company.pc_lock_enabled = True
        self.company.allowed_computer_name = "DESKTOP-9CHMLPJ"
        self.company.allowed_hardware_id = ""
        self.company.save()

        with patch.dict(os.environ, {"HOST_COMPUTERNAME": "DESKTOP-9CHMLPJ"}):
            response = self._client().get(BRANCHES_URL)
        self.assertEqual(response.status_code, 403)

    def test_computer_name_blank_blocks_even_if_hardware_id_matches(self):
        self.company.pc_lock_enabled = True
        self.company.allowed_computer_name = ""
        self.company.allowed_hardware_id = "4C4C4544-0044-3410-8035-B4C04F435931"
        self.company.save()

        with self._with_hardware_file("4C4C4544-0044-3410-8035-B4C04F435931"):
            with patch.dict(os.environ, {"HOST_COMPUTERNAME": "DESKTOP-9CHMLPJ"}):
                response = self._client().get(BRANCHES_URL)
        self.assertEqual(response.status_code, 403)

    def test_hardware_id_matching_passes(self):
        self.company.pc_lock_enabled = True
        self.company.allowed_computer_name = "DESKTOP-9CHMLPJ"
        self.company.allowed_hardware_id = "4C4C4544-0044-3410-8035-B4C04F435931"
        self.company.save()

        with self._with_hardware_file("4c4c4544-0044-3410-8035-b4c04f435931"):  # регистр не должен иметь значения
            with patch.dict(os.environ, {"HOST_COMPUTERNAME": "DESKTOP-9CHMLPJ"}):
                response = self._client().get(BRANCHES_URL)
        self.assertEqual(response.status_code, 200)

    def test_hardware_id_mismatch_blocks_even_if_name_matches(self):
        self.company.pc_lock_enabled = True
        self.company.allowed_computer_name = "DESKTOP-9CHMLPJ"
        self.company.allowed_hardware_id = "4C4C4544-0044-3410-8035-B4C04F435931"
        self.company.save()

        with self._with_hardware_file("00000000-0000-0000-0000-000000000000"):
            with patch.dict(os.environ, {"HOST_COMPUTERNAME": "DESKTOP-9CHMLPJ"}):
                response = self._client().get(BRANCHES_URL)
        self.assertEqual(response.status_code, 403)


class CompanyUpdateSerializerPcLockValidationTest(TenantTestCase):
    """
    CompanyUpdateSerializer.validate() — через API нельзя включить
    pc_lock_enabled, не заполнив оба поля (см. companies/middleware.py —
    иначе компания заблокируется сама после сохранения).
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Serializer Validation Co", schema_name="pclockvalidate")

    def test_enabling_without_both_fields_is_rejected(self):
        serializer = CompanyUpdateSerializer(self.company, data={"pc_lock_enabled": True}, partial=True)
        self.assertFalse(serializer.is_valid())

    def test_enabling_with_only_name_is_rejected(self):
        serializer = CompanyUpdateSerializer(
            self.company, data={"pc_lock_enabled": True, "allowed_computer_name": "DESKTOP-9CHMLPJ"}, partial=True,
        )
        self.assertFalse(serializer.is_valid())

    def test_enabling_with_both_fields_is_accepted(self):
        serializer = CompanyUpdateSerializer(
            self.company,
            data={
                "pc_lock_enabled": True,
                "allowed_computer_name": "DESKTOP-9CHMLPJ",
                "allowed_hardware_id": "4C4C4544-0044-3410-8035-B4C04F435931",
            },
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_disabling_lock_does_not_require_fields(self):
        serializer = CompanyUpdateSerializer(self.company, data={"pc_lock_enabled": False}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
