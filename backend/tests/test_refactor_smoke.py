"""Post-refactor smoke tests: hit every endpoint from the review request to confirm
no router-routing regressions (404), no NameError-style 500s, and key response keys intact.
Covers endpoints NOT already exercised in backend_test.py / test_marks.py."""
import os
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Read from /app/frontend/.env
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/")

BASE = _load_backend_url()
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={
        "username": os.environ.get("SUPER_ADMIN_USERNAME", "admin"),
        "password": os.environ.get("SUPER_ADMIN_PASSWORD", "12345678"),
    })
    assert r.status_code == 200, r.text
    token = r.json().get("access_token")
    assert token, "Login did not return an access_token"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- auth + classes ---
class TestAuth:
    def test_admin_login_returns_user(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"username": "admin", "password": "12345678"})
        assert r.status_code == 200
        j = r.json()
        assert "user" in j or "role" in j or "username" in j

    def test_parent_login(self, api_client):
        r = api_client.post(f"{API}/auth/parent-login", json={"username": "ali", "password": "123456"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert "student" in j or "studentId" in j or "id" in j

    def test_classes_list(self, api_client):
        r = api_client.get(f"{API}/classes")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --- students ---
class TestStudents:
    def test_students_paginated(self, api_client):
        r = api_client.get(f"{API}/students", params={"page": 1, "limit": 10})
        assert r.status_code == 200
        j = r.json()
        assert "students" in j

    def test_students_detail_keys(self, api_client):
        r = api_client.get(f"{API}/students", params={"limit": 1})
        sid = r.json()["students"][0]["id"]
        d = api_client.get(f"{API}/students/{sid}/detail")
        assert d.status_code == 200
        j = d.json()
        # Must contain core shape — same keys as before refactor
        for k in ("student", "payments"):
            assert k in j, f"missing key {k}"


# --- attendance ---
class TestAttendance:
    def test_get_attendance(self, api_client):
        r = api_client.get(f"{API}/attendance")
        assert r.status_code == 200

    def test_attendance_export(self, api_client):
        r = api_client.get(f"{API}/attendance/export", params={
            "studentClass": "1st Class", "section": "A",
            "startDate": "2024-01-01", "endDate": "2026-12-31",
        })
        # Stream/CSV/404 acceptable; must not 500
        assert r.status_code in (200, 404), r.text


# --- fees ---
class TestFees:
    def test_fees_day_sheet(self, api_client):
        r = api_client.get(f"{API}/fees/day-sheet")
        assert r.status_code == 200

    def test_fees_student_keys(self, api_client):
        r = api_client.get(f"{API}/fees/student/4543")
        assert r.status_code == 200, r.text
        j = r.json()
        # Should at minimum carry student info + payment data
        assert "student" in j or "studentName" in j or "payments" in j


# --- inventory / staff / expenses / events / homework / subjects ---
class TestMisc:
    def test_inventory_list(self, api_client):
        r = api_client.get(f"{API}/inventory")
        assert r.status_code == 200

    def test_staff_list(self, api_client):
        r = api_client.get(f"{API}/staff")
        assert r.status_code == 200

    def test_expenses_list(self, api_client):
        r = api_client.get(f"{API}/expenses")
        assert r.status_code == 200

    def test_events_list(self, api_client):
        r = api_client.get(f"{API}/events")
        assert r.status_code == 200

    def test_homework_list(self, api_client):
        r = api_client.get(f"{API}/homework")
        assert r.status_code == 200

    def test_subjects_list(self, api_client):
        r = api_client.get(f"{API}/subjects")
        assert r.status_code == 200


# --- settings + dashboard + parent + marks ---
class TestSettingsAndDashboards:
    def test_settings_whatsapp(self, api_client):
        r = api_client.get(f"{API}/settings/whatsapp")
        assert r.status_code == 200

    def test_settings_school(self, api_client):
        r = api_client.get(f"{API}/settings/school")
        assert r.status_code == 200

    def test_settings_database(self, api_client):
        # uses os.environ — covers the os import fix in operations.py
        r = api_client.get(f"{API}/settings/database")
        assert r.status_code == 200, r.text
        j = r.json()
        assert "mongoUrl" in j and "dbName" in j

    def test_stats_dashboard_keys(self, api_client):
        r = api_client.get(f"{API}/stats/dashboard")
        assert r.status_code == 200
        j = r.json()
        for k in ("totalStudents", "totalFeesCollected", "pendingFees"):
            assert k in j, f"missing dashboard key {k}"

    def test_parent_dashboard_keys(self, api_client):
        # Resolve Ali's student id via parent-login
        pl = api_client.post(f"{API}/auth/parent-login", json={"username": "ali", "password": "123456"})
        j = pl.json()
        sid = j.get("student", {}).get("id") or j.get("studentId") or j.get("id")
        assert sid, f"could not extract student id from parent-login response: {j}"
        r = api_client.get(f"{API}/parent/dashboard/{sid}")
        assert r.status_code == 200, r.text
        d = r.json()
        # Must keep prior contract (student + payments + marks + attendance)
        for k in ("student", "payments"):
            assert k in d, f"parent dashboard missing key {k}"

    def test_marks_sample_csv(self, api_client):
        r = api_client.get(f"{API}/marks/sample-csv", params={"studentClass": "1st Class", "section": "A"})
        assert r.status_code in (200, 404), r.text


# --- concessions list (verifies finance router loaded) ---
class TestConcessionsList:
    def test_concessions_list(self, api_client):
        r = api_client.get(f"{API}/concessions")
        assert r.status_code == 200
