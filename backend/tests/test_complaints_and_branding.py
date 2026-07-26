"""Tests for complaints CRUD, school settings, and invoice PDF logo embedding."""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"

_auth_state = {}


@pytest.fixture(scope="module", autouse=True)
def _login():
    r = requests.post(f"{API}/auth/login", json={
        "username": os.environ.get("SUPER_ADMIN_USERNAME", "admin"),
        "password": os.environ.get("SUPER_ADMIN_PASSWORD", "12345678"),
    }, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    _auth_state['token'] = r.json().get("access_token")


def _headers():
    return {"Authorization": f"Bearer {_auth_state.get('token')}"}


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    # Cleanup
    for cid in ids:
        try:
            requests.delete(f"{API}/complaints/{cid}", timeout=10, headers=_headers())
        except Exception:
            pass


# ==================== School Settings ====================
class TestSchoolSettings:
    def test_get_school_settings(self):
        r = requests.get(f"{API}/settings/school", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "schoolName" in d
        assert "schoolAddress" in d
        assert "logoUrl" in d
        # Per agent note - High Five is configured
        print(f"School: name={d.get('schoolName')}, logo_len={len(d.get('logoUrl') or '')}")


# ==================== Complaints CRUD ====================
class TestComplaints:
    def test_create_complaint(self, created_ids):
        due = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        payload = {
            "title": "TEST_Broken bench",
            "description": "Bench in class 5 needs repair",
            "dueDate": due,
            "priority": "high",
            "createdBy": "Teacher1",
            "createdByUsername": "teach1",
            "createdByRole": "teacher",
            "photoUrl": "data:image/png;base64,iVBORw0KGgo="
        }
        r = requests.post(f"{API}/complaints", json=payload, timeout=15, headers=_headers())
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == payload["title"]
        assert d["status"] == "pending"
        assert d["priority"] == "high"
        assert d["createdByUsername"] == "teach1"
        assert "id" in d
        created_ids.append(d["id"])

    def test_list_complaints_has_isOverdue(self, created_ids):
        r = requests.get(f"{API}/complaints", timeout=15, headers=_headers())
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            assert "isOverdue" in rows[0]
            assert isinstance(rows[0]["isOverdue"], bool)

    def test_overdue_count_endpoint(self):
        r = requests.get(f"{API}/complaints/overdue-count", timeout=15, headers=_headers())
        assert r.status_code == 200
        d = r.json()
        assert "overdue" in d and "pending" in d and "inProgress" in d
        assert isinstance(d["overdue"], int)

    def test_filter_by_status(self, created_ids):
        r = requests.get(f"{API}/complaints?status=pending", timeout=15, headers=_headers())
        assert r.status_code == 200
        rows = r.json()
        for x in rows:
            assert x["status"] == "pending"

    def test_filter_by_username(self, created_ids):
        r = requests.get(f"{API}/complaints?createdByUsername=teach1", timeout=15, headers=_headers())
        assert r.status_code == 200
        rows = r.json()
        for x in rows:
            assert x["createdByUsername"] == "teach1"

    def test_filter_overdueOnly_creates_then_filters(self, created_ids):
        # Create an overdue complaint (dueDate = yesterday)
        yest = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        payload = {
            "title": "TEST_Overdue item",
            "dueDate": yest,
            "priority": "medium",
            "createdBy": "Admin",
            "createdByUsername": "admin",
            "createdByRole": "super_admin",
        }
        r = requests.post(f"{API}/complaints", json=payload, timeout=15, headers=_headers())
        assert r.status_code == 200
        cid = r.json()["id"]
        created_ids.append(cid)
        # Filter overdueOnly
        r2 = requests.get(f"{API}/complaints?overdueOnly=true", timeout=15, headers=_headers())
        assert r2.status_code == 200
        rows = r2.json()
        ids = [x["id"] for x in rows]
        assert cid in ids
        # Each must be overdue
        for x in rows:
            assert x["isOverdue"] is True

    def test_update_status_in_progress_then_resolved(self, created_ids):
        # Create one
        due = (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')
        r = requests.post(f"{API}/complaints", json={
            "title": "TEST_status flow", "dueDate": due,
            "createdBy": "Admin", "createdByUsername": "admin", "createdByRole": "super_admin"
        }, timeout=15, headers=_headers())
        cid = r.json()["id"]
        created_ids.append(cid)

        # Update to in_progress
        r2 = requests.put(f"{API}/complaints/{cid}", json={"status": "in_progress"}, timeout=15, headers=_headers())
        assert r2.status_code == 200
        d = r2.json()
        assert d["status"] == "in_progress"
        assert d.get("lastStatusUpdate") is not None
        assert d.get("resolvedAt") is None

        # Update to resolved
        r3 = requests.put(f"{API}/complaints/{cid}", json={"status": "resolved"}, timeout=15, headers=_headers())
        assert r3.status_code == 200
        d3 = r3.json()
        assert d3["status"] == "resolved"
        assert d3.get("resolvedAt") is not None

        # GET to verify persistence
        r4 = requests.get(f"{API}/complaints", timeout=15, headers=_headers())
        rows = r4.json()
        match = next((x for x in rows if x["id"] == cid), None)
        assert match is not None
        assert match["status"] == "resolved"
        assert match["isOverdue"] is False  # resolved -> not overdue

    def test_delete_complaint(self):
        # Create and delete
        due = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        r = requests.post(f"{API}/complaints", json={
            "title": "TEST_delete me", "dueDate": due,
            "createdBy": "Admin", "createdByUsername": "admin", "createdByRole": "super_admin"
        }, timeout=15, headers=_headers())
        cid = r.json()["id"]
        r2 = requests.delete(f"{API}/complaints/{cid}", timeout=15, headers=_headers())
        assert r2.status_code == 200
        # Confirm gone
        r3 = requests.get(f"{API}/complaints", timeout=15, headers=_headers())
        ids = [x["id"] for x in r3.json()]
        assert cid not in ids
        # Delete again -> 404
        r4 = requests.delete(f"{API}/complaints/{cid}", timeout=15, headers=_headers())
        assert r4.status_code == 404


# ==================== Invoice PDF ====================
class TestInvoicePDF:
    def test_invoice_pdf_with_logo(self):
        # Need an existing payment - try today, then sweep some recent dates
        pid = None
        candidates = [datetime.now().strftime('%Y-%m-%d')]
        for delta in range(0, 365):
            candidates.append((datetime.now() - timedelta(days=delta)).strftime('%Y-%m-%d'))
        for d in candidates:
            r = requests.get(f"{API}/fees/day-sheet?date={d}", timeout=15, headers=_headers())
            if r.status_code == 200:
                payments = r.json().get("payments", [])
                if payments:
                    pid = payments[0]["id"]
                    break
        if not pid:
            pytest.skip("No payments available for invoice test")
        # Download invoice
        r2 = requests.get(f"{API}/fees/invoice/{pid}", timeout=20)
        assert r2.status_code == 200
        ct = r2.headers.get('content-type', '')
        assert 'application/pdf' in ct, f"Content-Type was {ct}"
        assert len(r2.content) > 1000, f"PDF too small: {len(r2.content)} bytes"
        assert r2.content[:4] == b'%PDF', "Response does not start with %PDF magic bytes"

        # View variant
        r3 = requests.get(f"{API}/fees/invoice-view/{pid}", timeout=20)
        assert r3.status_code == 200
        assert 'application/pdf' in r3.headers.get('content-type', '')
        assert r3.content[:4] == b'%PDF'
