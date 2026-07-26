"""
Backend API tests for School Management System
Covers: Leave Requests, Bulk Concessions, Student Promotion (fee carryover),
Send Reminders endpoint, and regression checks (students, fees, attendance, homework).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://academic-pro-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={
        "username": os.environ.get("SUPER_ADMIN_USERNAME", "admin"),
        "password": os.environ.get("SUPER_ADMIN_PASSWORD", "12345678"),
    })
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    assert token, "Login did not return an access_token"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def admin_token(api_client):
    # api_client is already authenticated as super_admin; kept for backward compatibility.
    return "super_admin"


@pytest.fixture(scope="session")
def test_student(api_client):
    """Create a dedicated test student to avoid polluting production data."""
    suffix = uuid.uuid4().hex[:6].upper()
    code = f"TSTLV{suffix}"
    payload = {
        "studentCode": code,
        "studentName": f"TEST_LeaveStudent_{suffix}",
        "studentClass": "TEST_CLASS_LV",
        "section": "A",
        "rollNo": f"R{suffix}",
        "mobile": "9999999999",
        "parentName": "TestParent",
        "fatherName": "TestFather",
        "motherName": "TestMother",
        "address": "TEST_address",
        "feeTerm1": 1000.0,
        "feeTerm2": 2000.0,
        "feeTerm3": 3000.0,
    }
    r = api_client.post(f"{API}/students", json=payload)
    assert r.status_code in (200, 201), f"Create student failed: {r.status_code} {r.text}"
    stu = r.json()
    yield stu
    # Cleanup
    try:
        api_client.delete(f"{API}/students/{stu['id']}")
    except Exception:
        pass


# ==================== Health & Auth ====================
class TestHealth:
    def test_login_admin(self, admin_token):
        assert admin_token is not None

    def test_login_invalid(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code in (400, 401, 403)


# ==================== Leave Requests ====================
class TestLeaveRequests:
    leave_id = None

    def test_create_leave_request(self, api_client, test_student):
        payload = {
            "studentId": test_student["id"],
            "studentCode": test_student["studentCode"],
            "studentName": test_student["studentName"],
            "fromDate": "2026-02-01",
            "toDate": "2026-02-03",
            "reason": "TEST_family_function",
        }
        r = api_client.post(f"{API}/leave-requests", json=payload)
        assert r.status_code in (200, 201), f"Create leave failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["studentId"] == test_student["id"]
        assert data["status"] == "pending"
        assert data["reason"] == "TEST_family_function"
        assert "id" in data
        TestLeaveRequests.leave_id = data["id"]

    def test_get_pending_leaves(self, api_client):
        r = api_client.get(f"{API}/leave-requests", params={"status": "pending"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        ids = [x["id"] for x in data]
        assert TestLeaveRequests.leave_id in ids

    def test_filter_by_student(self, api_client, test_student):
        r = api_client.get(f"{API}/leave-requests", params={"studentId": test_student["id"]})
        assert r.status_code == 200
        data = r.json()
        assert all(x["studentId"] == test_student["id"] for x in data)
        assert len(data) >= 1

    def test_approve_leave(self, api_client):
        assert TestLeaveRequests.leave_id, "No leave id from creation step"
        r = api_client.post(
            f"{API}/leave-requests/{TestLeaveRequests.leave_id}/approve",
            json={"approvedBy": "TEST_admin"},
        )
        assert r.status_code == 200, r.text
        # Verify persistence
        g = api_client.get(f"{API}/leave-requests", params={"studentId": "__dummy__"})
        # Fetch all and find
        g2 = api_client.get(f"{API}/leave-requests")
        assert g2.status_code == 200
        found = next((x for x in g2.json() if x["id"] == TestLeaveRequests.leave_id), None)
        assert found is not None
        assert found["status"] == "approved"
        assert found.get("approvedBy") == "TEST_admin"

    def test_reject_leave(self, api_client, test_student):
        # Create another leave then reject it
        payload = {
            "studentId": test_student["id"],
            "studentCode": test_student["studentCode"],
            "studentName": test_student["studentName"],
            "fromDate": "2026-03-01",
            "toDate": "2026-03-02",
            "reason": "TEST_rejection_case",
        }
        c = api_client.post(f"{API}/leave-requests", json=payload)
        assert c.status_code in (200, 201)
        lid = c.json()["id"]
        r = api_client.post(f"{API}/leave-requests/{lid}/reject", json={"rejectedBy": "TEST_admin"})
        assert r.status_code == 200
        g = api_client.get(f"{API}/leave-requests")
        found = next((x for x in g.json() if x["id"] == lid), None)
        assert found and found["status"] == "rejected"

    def test_approve_nonexistent(self, api_client):
        r = api_client.post(f"{API}/leave-requests/nonexistent-id-xyz/approve", json={"approvedBy": "x"})
        assert r.status_code == 404


# ==================== Bulk Concessions ====================
class TestBulkConcessions:
    def test_bulk_concession_empty(self, api_client):
        r = api_client.post(f"{API}/concessions/bulk", json={
            "studentCodes": [],
            "concessionAmount": 100,
            "requestedBy": "TEST_admin",
        })
        assert r.status_code == 400

    def test_bulk_concession_create(self, api_client, test_student):
        payload = {
            "studentCodes": [test_student["studentCode"], "NONEXISTENT_CODE_XYZ"],
            "termNumber": 1,
            "concessionAmount": 250.0,
            "requestedBy": "TEST_admin",
        }
        r = api_client.post(f"{API}/concessions/bulk", json=payload)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["created"] == 1
        assert test_student["studentCode"] in data["students"]
        assert len(data["errors"]) == 1
        # Verify the concession appears in list
        g = api_client.get(f"{API}/concessions", params={"status": "pending"})
        assert g.status_code == 200
        codes = [c.get("studentCode") for c in g.json()]
        assert test_student["studentCode"] in codes


# ==================== Promote Students (fee carryover - NEW FORMULA) ====================
# Formula:
#   total_due = (T1+T2+T3+customFees) - paid
#   new_T1 = old_T1 + total_due
#   new_T2 = old_T2
#   new_T3 = old_T3 + 5000
#   payments archived; promotionHistory appended (NOT overwritten)

def _create_promote_student(api_client, suffix=None):
    suffix = suffix or uuid.uuid4().hex[:6].upper()
    code = f"TSTPR{suffix}"
    payload = {
        "studentCode": code,
        "studentName": f"TEST_PromoteStudent_{suffix}",
        "studentClass": f"TEST_FROM_{suffix}",
        "section": "A",
        "rollNo": f"RP{suffix}",
        "mobile": "9888888888",
        "parentName": "TestParent", "fatherName": "TestFather",
        "motherName": "TestMother", "address": "TEST_address",
        "feeTerm1": 1000.0, "feeTerm2": 2000.0, "feeTerm3": 3000.0,
    }
    cr = api_client.post(f"{API}/students", json=payload)
    assert cr.status_code in (200, 201), cr.text
    return cr.json(), payload


class TestPromoteBulk:
    def test_bulk_preview_then_commit(self, api_client):
        stu, payload = _create_promote_student(api_client)
        try:
            # Pay 400 in term 1
            pr = api_client.post(f"{API}/fees/payment", json={
                "studentId": stu["id"], "studentCode": stu["studentCode"],
                "rollNo": stu["rollNo"], "studentName": stu["studentName"],
                "termNumber": 1, "amount": 400.0, "paymentMode": "cash",
                "collectedBy": "TEST_admin",
            })
            assert pr.status_code in (200, 201), pr.text

            from_class = payload["studentClass"]
            to_class = f"TEST_TO_{uuid.uuid4().hex[:6].upper()}"

            # ---- Preview (should NOT commit) ----
            pv = api_client.post(f"{API}/students/promote-preview",
                                 json={"fromClass": from_class, "toClass": to_class})
            assert pv.status_code == 200, pv.text
            pvd = pv.json()
            assert pvd["studentCount"] == 1
            row = pvd["preview"][0]
            assert row["studentId"] == stu["id"]
            assert row["totalPaid"] == 400.0
            # totalDue = (1000+2000+3000+0) - 400 = 5600
            assert row["totalDue"] == 5600.0
            assert row["totalExpected"] == 6000.0
            assert row["oldFees"]["term1"] == 1000.0
            assert row["oldFees"]["term2"] == 2000.0
            assert row["oldFees"]["term3"] == 3000.0
            # NEW formula: T1 = 1000 + 5600 = 6600, T2 = 2000, T3 = 3000+5000 = 8000
            assert row["newFees"]["term1"] == 6600.0, f"new T1={row['newFees']['term1']}"
            assert row["newFees"]["term2"] == 2000.0
            assert row["newFees"]["term3"] == 8000.0

            # Confirm preview did NOT commit (student still in fromClass)
            sg = api_client.get(f"{API}/students", params={"limit": 1000})
            found = next((s for s in sg.json().get("students", []) if s["id"] == stu["id"]), None)
            assert found is not None
            assert found["studentClass"] == from_class, "Preview must NOT commit"

            # ---- Commit ----
            pm = api_client.post(f"{API}/students/promote",
                                 json={"fromClass": from_class, "toClass": to_class})
            assert pm.status_code == 200, pm.text

            # Verify state
            sg2 = api_client.get(f"{API}/students", params={"limit": 1000})
            found2 = next((s for s in sg2.json().get("students", []) if s["id"] == stu["id"]), None)
            assert found2["studentClass"] == to_class
            assert found2["feeTerm1"] == 6600.0
            assert found2["feeTerm2"] == 2000.0
            assert found2["feeTerm3"] == 8000.0
            pyd = found2.get("previousYearDues")
            assert pyd, "previousYearDues should exist"
            assert pyd.get("amount") == 5600.0
            assert pyd.get("fromClass") == from_class

            # Verify payments archived (active should be empty now)
            d = api_client.get(f"{API}/students/{stu['id']}/detail")
            assert d.status_code == 200
            dj = d.json()
            active_pay = [p for p in dj.get("payments", []) if p.get("status") not in ("reverted", "archived")]
            assert len(active_pay) == 0, "Payments should be archived after promotion"
            # promotionHistory length 1
            assert len(dj.get("promotionHistory", [])) == 1
            entry = dj["promotionHistory"][0]
            assert entry["fromClass"] == from_class
            assert entry["toClass"] == to_class
            assert entry["totalDue"] == 5600.0
            assert entry["totalPaid"] == 400.0
            assert entry["newFees"]["term1"] == 6600.0
        finally:
            try: api_client.delete(f"{API}/students/{stu['id']}")
            except Exception: pass

    def test_promote_no_students(self, api_client):
        r = api_client.post(f"{API}/students/promote", json={
            "fromClass": f"NONEXISTENT_{uuid.uuid4().hex[:6]}", "toClass": "X"
        })
        assert r.status_code == 404

    def test_promote_preview_no_students(self, api_client):
        r = api_client.post(f"{API}/students/promote-preview", json={
            "fromClass": f"NONEXISTENT_{uuid.uuid4().hex[:6]}", "toClass": "X"
        })
        assert r.status_code == 404


class TestPromoteSingle:
    def test_single_preview_and_commit_and_history_append(self, api_client):
        stu, payload = _create_promote_student(api_client)
        try:
            # Pay 400 term 1
            pr = api_client.post(f"{API}/fees/payment", json={
                "studentId": stu["id"], "studentCode": stu["studentCode"],
                "rollNo": stu["rollNo"], "studentName": stu["studentName"],
                "termNumber": 1, "amount": 400.0, "paymentMode": "cash",
                "collectedBy": "TEST_admin",
            })
            assert pr.status_code in (200, 201)

            to_class_1 = f"TEST_TO1_{uuid.uuid4().hex[:6].upper()}"
            to_class_2 = f"TEST_TO2_{uuid.uuid4().hex[:6].upper()}"

            # Single preview
            sp = api_client.post(f"{API}/students/{stu['id']}/promote-preview",
                                 json={"toClass": to_class_1})
            assert sp.status_code == 200, sp.text
            spd = sp.json()
            assert spd["studentId"] == stu["id"]
            assert spd["totalPaid"] == 400.0
            assert spd["totalDue"] == 5600.0
            assert spd["oldFees"]["term1"] == 1000.0
            assert spd["newFees"]["term1"] == 6600.0
            assert spd["newFees"]["term2"] == 2000.0
            assert spd["newFees"]["term3"] == 8000.0

            # Verify preview did NOT commit
            sg = api_client.get(f"{API}/students", params={"limit": 1000})
            f = next((s for s in sg.json()["students"] if s["id"] == stu["id"]), None)
            assert f["studentClass"] == payload["studentClass"]

            # Single commit (1st promotion)
            cm = api_client.post(f"{API}/students/{stu['id']}/promote",
                                 json={"toClass": to_class_1})
            assert cm.status_code == 200, cm.text

            # Detail check after 1st promotion
            d1 = api_client.get(f"{API}/students/{stu['id']}/detail")
            dj1 = d1.json()
            assert dj1["student"]["studentClass"] == to_class_1
            assert dj1["student"]["feeTerm1"] == 6600.0
            assert dj1["student"]["feeTerm3"] == 8000.0
            assert len(dj1["promotionHistory"]) == 1

            # Pay 100 in term 1 of new class (so 2nd promotion has total_due = 6600+2000+8000 - 100 = 16500)
            pr2 = api_client.post(f"{API}/fees/payment", json={
                "studentId": stu["id"], "studentCode": stu["studentCode"],
                "rollNo": stu["rollNo"], "studentName": stu["studentName"],
                "termNumber": 1, "amount": 100.0, "paymentMode": "cash",
                "collectedBy": "TEST_admin",
            })
            assert pr2.status_code in (200, 201)

            # 2nd promotion (history must APPEND, not overwrite)
            cm2 = api_client.post(f"{API}/students/{stu['id']}/promote",
                                  json={"toClass": to_class_2})
            assert cm2.status_code == 200

            d2 = api_client.get(f"{API}/students/{stu['id']}/detail")
            dj2 = d2.json()
            assert dj2["student"]["studentClass"] == to_class_2
            # new_T1 = 6600 + (16500) = 23100, T2 = 2000, T3 = 8000+5000 = 13000
            assert dj2["student"]["feeTerm1"] == 23100.0, f"got {dj2['student']['feeTerm1']}"
            assert dj2["student"]["feeTerm2"] == 2000.0
            assert dj2["student"]["feeTerm3"] == 13000.0
            # promotionHistory must have 2 entries (append!)
            ph = dj2["promotionHistory"]
            assert len(ph) == 2, f"Expected 2 history entries, got {len(ph)}"
            assert ph[0]["toClass"] == to_class_1
            assert ph[1]["toClass"] == to_class_2
            assert ph[1]["fromClass"] == to_class_1
            assert ph[1]["totalDue"] == 16500.0
        finally:
            try: api_client.delete(f"{API}/students/{stu['id']}")
            except Exception: pass

    def test_single_promote_404(self, api_client):
        r = api_client.post(f"{API}/students/nonexistent-xyz/promote", json={"toClass": "X"})
        assert r.status_code == 404
        r2 = api_client.post(f"{API}/students/nonexistent-xyz/promote-preview", json={"toClass": "X"})
        assert r2.status_code == 404


# ==================== Send Reminders (regression) ====================
class TestSendReminders:
    def test_send_reminders_endpoint(self, api_client):
        # Route is POST /api/fees/send-reminders (task mentions GET but server.py defines POST)
        r = api_client.post(f"{API}/fees/send-reminders")
        assert r.status_code == 200, f"Send reminders failed: {r.status_code} {r.text}"
        data = r.json()
        assert "message" in data
        assert "feeTypesChecked" in data


# ==================== Regression Tests ====================
class TestRegression:
    def test_students_list(self, api_client):
        r = api_client.get(f"{API}/students", params={"limit": 5})
        assert r.status_code == 200
        data = r.json()
        assert "students" in data and "total" in data

    def test_fee_types_list(self, api_client):
        r = api_client.get(f"{API}/fee-types")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_attendance_get(self, api_client):
        r = api_client.get(f"{API}/attendance", params={"date": "2026-01-01"})
        assert r.status_code == 200

    def test_homework_list(self, api_client):
        r = api_client.get(f"{API}/homework")
        assert r.status_code == 200

    def test_expenses_list(self, api_client):
        r = api_client.get(f"{API}/expenses")
        assert r.status_code == 200

    def test_concessions_list(self, api_client):
        r = api_client.get(f"{API}/concessions")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_staff_list(self, api_client):
        r = api_client.get(f"{API}/staff")
        assert r.status_code == 200
