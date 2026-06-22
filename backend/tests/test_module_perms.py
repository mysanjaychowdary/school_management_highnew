"""Tests for the per-module CRUD permissions (modulePerms) feature on Roles."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://academic-pro-6.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_roles(api):
    """Cleanup any test_perm_* roles before/after this module run."""
    def _purge():
        try:
            roles = api.get(f"{BASE_URL}/api/roles").json()
            for r in roles:
                if r.get("roleName", "").startswith("test_perm_"):
                    api.delete(f"{BASE_URL}/api/roles/{r['id']}")
        except Exception:
            pass
    _purge()
    yield
    _purge()


class TestModulePermsCRUD:
    """POST/PUT/GET round-trip for modulePerms field."""

    def test_post_role_with_module_perms(self, api):
        payload = {
            "roleName": "test_perm_x",
            "label": "X",
            "modules": ["homework", "marks"],
            "modulePerms": {
                "homework": {"create": True, "edit": True, "delete": False},
                "marks": {"create": True, "edit": False, "delete": False},
            },
        }
        r = api.post(f"{BASE_URL}/api/roles", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["roleName"] == "test_perm_x"
        assert "modulePerms" in d
        assert d["modulePerms"]["homework"] == {"create": True, "edit": True, "delete": False}
        assert d["modulePerms"]["marks"] == {"create": True, "edit": False, "delete": False}

        # GET-back persistence verification
        roles = api.get(f"{BASE_URL}/api/roles").json()
        match = next(x for x in roles if x["roleName"] == "test_perm_x")
        assert match["modulePerms"]["homework"]["edit"] is True
        assert match["modulePerms"]["homework"]["delete"] is False

    def test_put_role_updates_module_perms(self, api):
        roles = api.get(f"{BASE_URL}/api/roles").json()
        target = next(r for r in roles if r["roleName"] == "test_perm_x")
        rid = target["id"]
        new_perms = {
            "homework": {"create": False, "edit": True, "delete": True},
            "marks": {"create": True, "edit": True, "delete": True},
            "students": {"create": True, "edit": False, "delete": False},
        }
        r = api.put(f"{BASE_URL}/api/roles/{rid}", json={
            "modules": ["homework", "marks", "students"],
            "modulePerms": new_perms,
        })
        assert r.status_code == 200, r.text
        # Verify round-trip via GET
        roles = api.get(f"{BASE_URL}/api/roles").json()
        target = next(r for r in roles if r["roleName"] == "test_perm_x")
        assert target["modulePerms"]["homework"]["delete"] is True
        assert target["modulePerms"]["homework"]["create"] is False
        assert target["modulePerms"]["students"]["create"] is True
        assert target["modulePerms"]["marks"]["delete"] is True

    def test_get_legacy_roles_have_empty_module_perms(self, api):
        roles = api.get(f"{BASE_URL}/api/roles").json()
        legacy_names = {"teacher", "admin_role", "office_staff", "super_admin"}
        for r in roles:
            if r["roleName"] in legacy_names:
                # Field must be present, dict, and empty (legacy backfill)
                assert "modulePerms" in r, f"{r['roleName']} missing modulePerms"
                assert isinstance(r["modulePerms"], dict)
                assert r["modulePerms"] == {}, (
                    f"{r['roleName']} should have empty modulePerms, got {r['modulePerms']}"
                )


class TestLoginIncludesModulePerms:
    def test_admin_login_includes_module_perms(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "12345678"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "roleDetails" in d
        rd = d["roleDetails"]
        assert "modulePerms" in rd
        assert isinstance(rd["modulePerms"], dict)
        # super_admin is legacy => empty
        assert rd["modulePerms"] == {}

    def test_teacher_login_includes_empty_module_perms(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "teach1", "password": "pass123"})
        if r.status_code != 200:
            # Try alternative seeded password
            r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "teach1", "password": "12345678"})
        assert r.status_code == 200, r.text
        d = r.json()
        rd = d["roleDetails"]
        assert "modulePerms" in rd
        assert isinstance(rd["modulePerms"], dict)
        assert rd["modulePerms"] == {}


class TestCleanupTestRole:
    def test_delete_test_perm_x(self, api):
        roles = api.get(f"{BASE_URL}/api/roles").json()
        target = next((r for r in roles if r["roleName"] == "test_perm_x"), None)
        if not target:
            pytest.skip("test_perm_x not present (already cleaned)")
        r = api.delete(f"{BASE_URL}/api/roles/{target['id']}")
        assert r.status_code == 200
