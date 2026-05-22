"""Tests for custom roles + module-based permissions feature."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://academic-pro-6.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def cleanup_test_role(api):
    """Cleanup any TEST_ prefixed roles before/after tests."""
    yield
    try:
        roles = api.get(f"{BASE_URL}/api/roles").json()
        for r in roles:
            if r.get("roleName", "").startswith("test_"):
                api.delete(f"{BASE_URL}/api/roles/{r['id']}")
    except Exception:
        pass


# ==================== System role seeding ====================
class TestSystemRoles:
    def test_get_roles_seeds_4_system_roles(self, api):
        r = api.get(f"{BASE_URL}/api/roles")
        assert r.status_code == 200
        roles = r.json()
        names = {x["roleName"]: x for x in roles}
        for n in ["super_admin", "admin_role", "teacher", "office_staff"]:
            assert n in names, f"System role {n} not seeded"
            assert names[n]["isSystem"] is True

    def test_super_admin_has_14_modules_and_full_perms(self, api):
        roles = api.get(f"{BASE_URL}/api/roles").json()
        sa = next(r for r in roles if r["roleName"] == "super_admin")
        assert len(sa["modules"]) == 14
        for f in ["canEdit", "canDelete", "canExport", "canEditFees",
                  "canRevertFees", "canApproveConcession", "canSeeFullMobile"]:
            assert sa[f] is True

    def test_teacher_role_specific_modules(self, api):
        roles = api.get(f"{BASE_URL}/api/roles").json()
        t = next(r for r in roles if r["roleName"] == "teacher")
        # Per spec: students, attendance, calendar, homework, marks, approvals
        assert set(t["modules"]) == {"students", "attendance", "calendar", "homework", "marks", "approvals"}
        assert t["canEdit"] is False
        assert t["canExport"] is False


# ==================== Custom role CRUD ====================
class TestCustomRoleCRUD:
    def test_create_custom_role(self, api, cleanup_test_role):
        payload = {
            "roleName": "test_librarian",
            "label": "Test Librarian",
            "modules": ["students", "inventory"],
            "canEdit": True,
            "canExport": True,
        }
        r = api.post(f"{BASE_URL}/api/roles", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["roleName"] == "test_librarian"
        assert set(d["modules"]) == {"students", "inventory"}
        assert d["canEdit"] is True
        assert d["canExport"] is True
        assert d["canDelete"] is False
        assert d["isSystem"] is False
        # Persistence check
        all_roles = api.get(f"{BASE_URL}/api/roles").json()
        assert any(x["roleName"] == "test_librarian" for x in all_roles)

    def test_create_duplicate_role_rejected(self, api):
        payload = {"roleName": "test_librarian", "modules": ["students"]}
        r = api.post(f"{BASE_URL}/api/roles", json=payload)
        assert r.status_code == 400
        assert "already exists" in r.json().get("detail", "").lower()

    def test_update_custom_role(self, api):
        roles = api.get(f"{BASE_URL}/api/roles").json()
        target = next(r for r in roles if r["roleName"] == "test_librarian")
        rid = target["id"]
        update = {"modules": ["students", "inventory", "fees"], "canDelete": True}
        r = api.put(f"{BASE_URL}/api/roles/{rid}", json=update)
        assert r.status_code == 200, r.text
        # Verify with GET
        roles = api.get(f"{BASE_URL}/api/roles").json()
        target = next(r for r in roles if r["roleName"] == "test_librarian")
        assert "fees" in target["modules"]
        assert target["canDelete"] is True

    def test_update_super_admin_rejected(self, api):
        roles = api.get(f"{BASE_URL}/api/roles").json()
        sa = next(r for r in roles if r["roleName"] == "super_admin")
        r = api.put(f"{BASE_URL}/api/roles/{sa['id']}", json={"modules": ["students"]})
        assert r.status_code == 400
        assert "super_admin" in r.json().get("detail", "").lower()

    def test_delete_system_role_rejected(self, api):
        roles = api.get(f"{BASE_URL}/api/roles").json()
        teach = next(r for r in roles if r["roleName"] == "teacher")
        r = api.delete(f"{BASE_URL}/api/roles/{teach['id']}")
        assert r.status_code == 400
        assert "system" in r.json().get("detail", "").lower()

    def test_delete_role_with_assigned_staff_rejected(self, api):
        # Create staff using test_librarian
        staff_payload = {
            "name": "TEST_LibStaff",
            "role": "test_librarian",
            "mobile": "9999999999",
            "joiningDate": "2025-01-01",
            "username": "test_libuser",
            "password": "pass",
        }
        sr = api.post(f"{BASE_URL}/api/staff", json=staff_payload)
        assert sr.status_code in (200, 201), sr.text
        staff_id = sr.json()["id"]

        try:
            roles = api.get(f"{BASE_URL}/api/roles").json()
            target = next(r for r in roles if r["roleName"] == "test_librarian")
            r = api.delete(f"{BASE_URL}/api/roles/{target['id']}")
            assert r.status_code == 400
            detail = r.json().get("detail", "").lower()
            assert "staff" in detail or "using" in detail
        finally:
            api.delete(f"{BASE_URL}/api/staff/{staff_id}")

    def test_delete_custom_role_succeeds_when_unused(self, api):
        roles = api.get(f"{BASE_URL}/api/roles").json()
        target = next(r for r in roles if r["roleName"] == "test_librarian")
        r = api.delete(f"{BASE_URL}/api/roles/{target['id']}")
        assert r.status_code == 200
        # Verify removal
        roles = api.get(f"{BASE_URL}/api/roles").json()
        assert not any(r["roleName"] == "test_librarian" for r in roles)


# ==================== Login returns roleDetails ====================
class TestLoginRoleDetails:
    def test_super_admin_login_returns_role_details(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "12345678"})
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "super_admin"
        assert "roleDetails" in d
        rd = d["roleDetails"]
        assert len(rd["modules"]) == 14
        assert rd["canEdit"] is True
        assert rd["canEditFees"] is True
        assert rd["canApproveConcession"] is True
        assert rd["isSystem"] is True

    def test_teacher_login_returns_role_details(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "teach1", "password": "12345678"})
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "teacher"
        rd = d["roleDetails"]
        assert rd["isSystem"] is True
        assert set(rd["modules"]) == {"students", "attendance", "calendar", "homework", "marks", "approvals"}
        assert rd["canEdit"] is False
        assert rd["canExport"] is False

    def test_custom_role_login_returns_matching_perms(self, api):
        # Setup: create custom role + staff
        api.post(f"{BASE_URL}/api/roles", json={
            "roleName": "test_accountant",
            "label": "Test Accountant",
            "modules": ["fees", "expenses"],
            "canExport": True,
            "canRevertFees": True,
        })
        sr = api.post(f"{BASE_URL}/api/staff", json={
            "name": "TEST_Acct",
            "role": "test_accountant",
            "mobile": "8888888888",
            "joiningDate": "2025-01-01",
            "username": "test_acct",
            "password": "pass",
        })
        assert sr.status_code in (200, 201)
        staff_id = sr.json()["id"]

        try:
            r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "test_acct", "password": "pass"})
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["role"] == "test_accountant"
            rd = d["roleDetails"]
            assert set(rd["modules"]) == {"fees", "expenses"}
            assert rd["canExport"] is True
            assert rd["canRevertFees"] is True
            assert rd["canEdit"] is False
            assert rd["isSystem"] is False
        finally:
            # Cleanup: delete staff then role
            api.delete(f"{BASE_URL}/api/staff/{staff_id}")
            roles = api.get(f"{BASE_URL}/api/roles").json()
            for x in roles:
                if x["roleName"] == "test_accountant":
                    api.delete(f"{BASE_URL}/api/roles/{x['id']}")
