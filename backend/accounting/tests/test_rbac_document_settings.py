# backend/accounting/tests/test_rbac_document_settings.py
from accounting.tests.base import BaseRBACTest


class TestDocumentSettingsRBAC(BaseRBACTest):
    resource_name = "documentsettings"
    list_url = "/api/accounting/document-settings/"
    detail_url = "/api/accounting/document-settings/{id}/"
    create_payload = {"purchase_price_type": None}
    update_payload = {"purchase_price_type": None}
