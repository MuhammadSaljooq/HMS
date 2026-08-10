from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import UserRole
from app.services import authorization_service as authz


def _user(role: UserRole):
    return SimpleNamespace(role=role, id=uuid4())


def test_can_manage_billing():
    assert authz.can_manage_billing(_user(UserRole.cashier)) is True
    assert authz.can_manage_billing(_user(UserRole.admin)) is True
    assert authz.can_manage_billing(_user(UserRole.doctor)) is False
    assert authz.can_manage_billing(_user(UserRole.nurse)) is False


def test_can_void_and_catalog_are_admin_only():
    assert authz.can_void_invoice(_user(UserRole.admin)) is True
    assert authz.can_void_invoice(_user(UserRole.cashier)) is False
    assert authz.can_manage_service_catalog(_user(UserRole.admin)) is True
    assert authz.can_manage_service_catalog(_user(UserRole.cashier)) is False


def test_reconciliation_visibility():
    assert authz.can_view_all_reconciliation(_user(UserRole.admin)) is True
    assert authz.can_view_all_reconciliation(_user(UserRole.cashier)) is False
