# backend/accounting/tests/test_agent_scope.py
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.test import APIClient

from companies.models import Company, Domain
from users.models import Permission, Role, RolePermission, UserRole
from accounting.models import (
    Agent, Branch, CompanyProfile, Counterparty, Document, Employee, Position, Warehouse,
)

User = get_user_model()

COUNTERPARTY_LIST_URL = '/api/accounting/counterparties/'
DOCUMENT_LIST_URL = '/api/accounting/documents/'


class AgentScopeTest(TenantTestCase):
    """
    Роль "Агент": пользователь должен видеть только тех Counterparty (и связанные
    с ними Document), где Counterparty.agent.employee.user == он сам — см.
    users/scoping.py::apply_agent_scope, CounterpartyViewSet/DocumentViewSet.get_queryset.
    Один Employee может иметь несколько Agent-профилей (районов) — пользователь
    должен видеть данные по ВСЕМ своим профилям сразу.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="AgentScope Test Co", schema_name="agentscopetest")
        Domain.objects.create(domain='agentscopetest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            agent_role, _ = Role.objects.get_or_create(name="Агент")
            for resource in ("counterparty", "document"):
                perm, _ = Permission.objects.get_or_create(resource=resource, action="GET")
                RolePermission.objects.get_or_create(role=agent_role, permission=perm)

            position, _ = Position.objects.get_or_create(name="Агент")

            self.agent1_user = User.objects.create_user(username="agent1", password="pass")
            UserRole.objects.create(user=self.agent1_user, role=agent_role)
            self.agent1_employee = Employee.objects.create(full_name="Agent One", position=position, user=self.agent1_user)
            # у agent1 два профиля (два "района") на одного и того же Employee
            self.agent1_profile_rayon = Agent.objects.create(employee=self.agent1_employee, district="Rayon")
            self.agent1_profile_dashoguz = Agent.objects.create(employee=self.agent1_employee, district="Dashoguz")

            self.agent2_user = User.objects.create_user(username="agent2", password="pass")
            UserRole.objects.create(user=self.agent2_user, role=agent_role)
            self.agent2_employee = Employee.objects.create(full_name="Agent Two", position=position, user=self.agent2_user)
            self.agent2_profile = Agent.objects.create(employee=self.agent2_employee, district="")

            # Обычный (не агент) пользователь с тем же правом GET на counterparty/document —
            # должен видеть всё, без сужения по agent.
            manager_role, _ = Role.objects.get_or_create(name="Менеджер (тест)")
            for resource in ("counterparty", "document"):
                perm, _ = Permission.objects.get_or_create(resource=resource, action="GET")
                RolePermission.objects.get_or_create(role=manager_role, permission=perm)
            self.manager_user = User.objects.create_user(username="manager", password="pass")
            UserRole.objects.create(user=self.manager_user, role=manager_role)

            self.superuser = User.objects.create_superuser(username="root", password="pass")

            self.cp_agent1_rayon = Counterparty.objects.create(name="Client of Agent1 Rayon", type="client", agent=self.agent1_profile_rayon, district="Rayon")
            self.cp_agent1_dashoguz = Counterparty.objects.create(name="Client of Agent1 Dashoguz", type="client", agent=self.agent1_profile_dashoguz, district="Dashoguz")
            self.cp_agent2 = Counterparty.objects.create(name="Client of Agent2", type="client", agent=self.agent2_profile)
            self.cp_unassigned = Counterparty.objects.create(name="Unassigned Client", type="client")

            company_profile = CompanyProfile.objects.create()
            branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            warehouse = Warehouse.objects.create(name="Main WH", branch=branch)

            self.doc_agent1_rayon = Document.objects.create(
                document_type='out', date='2026-01-05', warehouse=warehouse, branch=branch,
                counterparty=self.cp_agent1_rayon,
            )
            self.doc_agent1_dashoguz = Document.objects.create(
                document_type='out', date='2026-01-07', warehouse=warehouse, branch=branch,
                counterparty=self.cp_agent1_dashoguz,
            )
            self.doc_agent2 = Document.objects.create(
                document_type='out', date='2026-01-06', warehouse=warehouse, branch=branch,
                counterparty=self.cp_agent2,
            )

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'agentscopetest.localhost'
        client.force_authenticate(user=user)
        return client

    def _ids(self, response):
        data = response.data if isinstance(response.data, list) else response.data['results']
        return {row['id'] for row in data}

    # ── Counterparty ─────────────────────────────────────────────────────────

    def test_agent_sees_own_counterparty_across_all_district_profiles(self):
        # agent1 имеет 2 Agent-профиля (Rayon/Dashoguz) на одном Employee —
        # должен видеть клиентов ОБОИХ профилей, не только одного.
        response = self._client(self.agent1_user).get(COUNTERPARTY_LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._ids(response), {self.cp_agent1_rayon.id, self.cp_agent1_dashoguz.id})

    def test_other_agent_does_not_see_foreign_counterparty(self):
        response = self._client(self.agent2_user).get(COUNTERPARTY_LIST_URL)
        ids = self._ids(response)
        self.assertIn(self.cp_agent2.id, ids)
        self.assertNotIn(self.cp_agent1_rayon.id, ids)
        self.assertNotIn(self.cp_agent1_dashoguz.id, ids)
        self.assertNotIn(self.cp_unassigned.id, ids)

    def test_non_agent_role_sees_all_counterparties(self):
        response = self._client(self.manager_user).get(COUNTERPARTY_LIST_URL)
        ids = self._ids(response)
        self.assertEqual(ids, {self.cp_agent1_rayon.id, self.cp_agent1_dashoguz.id, self.cp_agent2.id, self.cp_unassigned.id})

    def test_superuser_sees_all_counterparties(self):
        response = self._client(self.superuser).get(COUNTERPARTY_LIST_URL)
        ids = self._ids(response)
        self.assertEqual(ids, {self.cp_agent1_rayon.id, self.cp_agent1_dashoguz.id, self.cp_agent2.id, self.cp_unassigned.id})

    # ── Document ─────────────────────────────────────────────────────────────

    def test_agent_sees_documents_of_own_counterparty_across_districts(self):
        response = self._client(self.agent1_user).get(DOCUMENT_LIST_URL)
        self.assertEqual(self._ids(response), {self.doc_agent1_rayon.id, self.doc_agent1_dashoguz.id})

    def test_non_agent_role_sees_all_documents(self):
        response = self._client(self.manager_user).get(DOCUMENT_LIST_URL)
        ids = self._ids(response)
        self.assertEqual(ids, {self.doc_agent1_rayon.id, self.doc_agent1_dashoguz.id, self.doc_agent2.id})
