"""
Backend tests for the Marks module (sample CSV, bulk upload, listing,
distinct values, stats, compare, parent dashboard inclusion).
"""
import os
import uuid
import csv
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://academic-pro-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_students(api_client):
    """Create 3 test students in a dedicated TEST_MARKS class so we have a
    deterministic set to upload marks for."""
    suffix = uuid.uuid4().hex[:6].upper()
    student_class = f"TEST_MARKS_{suffix}"
    section = "A"
    created = []
    for i in range(3):
        code = f"TM{suffix}{i}"
        payload = {
            "studentCode": code,
            "studentName": f"TEST_MarkStudent_{i}_{suffix}",
            "studentClass": student_class,
            "section": section,
            "rollNo": f"R{i}",
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
        created.append(r.json())
    yield {"students": created, "studentClass": student_class, "section": section}
    # Cleanup students + marks
    for s in created:
        try:
            api_client.delete(f"{API}/students/{s['id']}")
        except Exception:
            pass


# ---------- /marks/sample-csv ----------
class TestSampleCSV:
    def test_sample_csv_download_with_correct_header_and_rows(self, api_client, test_students):
        sc = test_students["studentClass"]
        sec = test_students["section"]
        r = api_client.get(f"{API}/marks/sample-csv", params={"studentClass": sc, "section": sec})
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "")

        reader = list(csv.reader(io.StringIO(r.text)))
        # header + 3 students
        assert reader[0] == ["Student ID", "Name", "Exam Name", "Subject", "Marks", "Max Marks"]
        assert len(reader) == 1 + 3
        # Each data row prefilled with code + name, empty exam/subject/marks, max=100
        codes = {row[0] for row in reader[1:]}
        expected_codes = {s["studentCode"] for s in test_students["students"]}
        assert codes == expected_codes
        for row in reader[1:]:
            assert row[1].startswith("TEST_MarkStudent_")
            assert row[2] == "" and row[3] == "" and row[4] == ""
            assert row[5] == "100"

    def test_sample_csv_404_for_unknown_class(self, api_client):
        r = api_client.get(f"{API}/marks/sample-csv", params={"studentClass": "NO_SUCH_CLASS_XYZ", "section": "Z"})
        assert r.status_code == 404


# ---------- /marks/bulk ----------
class TestMarksBulk:
    def test_bulk_create_and_persistence(self, api_client, test_students):
        sc = test_students["studentClass"]
        sec = test_students["section"]
        students = test_students["students"]
        rows = [
            {"studentCode": students[0]["studentCode"], "examName": "Midterm", "subject": "Math", "marks": 90},
            {"studentCode": students[1]["studentCode"], "examName": "Midterm", "subject": "Math", "marks": 50},
            {"studentCode": students[2]["studentCode"], "examName": "Midterm", "subject": "Math", "marks": 20},
            {"studentCode": "NO_SUCH_CODE_XYZ", "examName": "Midterm", "subject": "Math", "marks": 70},  # error
        ]
        payload = {
            "studentClass": sc, "section": sec,
            "examName": "Midterm", "subject": "Math", "maxMarks": 100,
            "recordedBy": "TEST_runner", "rows": rows,
        }
        r = api_client.post(f"{API}/marks/bulk", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["created"] == 3
        assert len(body["errors"]) == 1 and "NO_SUCH_CODE_XYZ" in body["errors"][0]

        # GET to verify persistence
        g = api_client.get(f"{API}/marks", params={"studentClass": sc, "section": sec, "examName": "Midterm"})
        assert g.status_code == 200
        recs = g.json()
        assert len(recs) == 3
        codes_marks = {r["studentCode"]: r["marks"] for r in recs}
        assert codes_marks[students[0]["studentCode"]] == 90
        assert codes_marks[students[1]["studentCode"]] == 50
        assert codes_marks[students[2]["studentCode"]] == 20
        # All entries have subject Math + maxMarks 100
        for rec in recs:
            assert rec["subject"] == "Math"
            assert rec["maxMarks"] == 100

    def test_bulk_create_second_subject(self, api_client, test_students):
        """Upload Science marks for the Final exam (used by compare/stats tests)."""
        sc = test_students["studentClass"]
        sec = test_students["section"]
        students = test_students["students"]
        payload = {
            "studentClass": sc, "section": sec,
            "examName": "Final", "subject": "Science", "maxMarks": 100,
            "rows": [
                {"studentCode": students[0]["studentCode"], "examName": "Final", "subject": "Science", "marks": 80},
                {"studentCode": students[1]["studentCode"], "examName": "Final", "subject": "Science", "marks": 40},
                {"studentCode": students[2]["studentCode"], "examName": "Final", "subject": "Science", "marks": 25},
            ],
        }
        r = api_client.post(f"{API}/marks/bulk", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["created"] == 3

    def test_bulk_upsert_replaces_existing(self, api_client, test_students):
        """Re-uploading same student+exam+subject must replace, not duplicate."""
        sc = test_students["studentClass"]
        sec = test_students["section"]
        students = test_students["students"]
        payload = {
            "studentClass": sc, "section": sec,
            "examName": "Midterm", "subject": "Math",
            "rows": [{"studentCode": students[0]["studentCode"], "examName": "Midterm", "subject": "Math", "marks": 95}],
        }
        r = api_client.post(f"{API}/marks/bulk", json=payload)
        assert r.status_code == 200
        # Verify only one record exists for that student/exam/subject and value updated
        g = api_client.get(f"{API}/marks", params={
            "studentId": students[0]["id"], "examName": "Midterm", "subject": "Math"
        })
        recs = g.json()
        assert len(recs) == 1
        assert recs[0]["marks"] == 95

    def test_bulk_empty_rows_400(self, api_client, test_students):
        r = api_client.post(f"{API}/marks/bulk", json={
            "studentClass": test_students["studentClass"],
            "section": test_students["section"],
            "examName": "X", "subject": "Y", "rows": []
        })
        assert r.status_code == 400


# ---------- /marks (list) + /marks/distinct ----------
class TestMarksListing:
    def test_list_filter_by_class_section(self, api_client, test_students):
        sc = test_students["studentClass"]
        sec = test_students["section"]
        r = api_client.get(f"{API}/marks", params={"studentClass": sc, "section": sec})
        assert r.status_code == 200
        recs = r.json()
        # We've uploaded Midterm/Math (3) + Final/Science (3) = 6
        assert len(recs) >= 6
        for rec in recs:
            assert rec["studentClass"] == sc and rec["section"] == sec

    def test_list_filter_by_student_id(self, api_client, test_students):
        sid = test_students["students"][0]["id"]
        r = api_client.get(f"{API}/marks", params={"studentId": sid})
        assert r.status_code == 200
        recs = r.json()
        # Student 0 has Midterm/Math + Final/Science
        assert len(recs) == 2

    def test_distinct_includes_uploaded_values(self, api_client, test_students):
        r = api_client.get(f"{API}/marks/distinct")
        assert r.status_code == 200
        data = r.json()
        for key in ("exams", "subjects", "classes"):
            assert key in data and isinstance(data[key], list)
        assert "Midterm" in data["exams"]
        assert "Final" in data["exams"]
        assert "Math" in data["subjects"]
        assert "Science" in data["subjects"]
        assert test_students["studentClass"] in data["classes"]


# ---------- /marks/stats ----------
class TestMarksStats:
    def test_stats_overall_structure(self, api_client, test_students):
        sc = test_students["studentClass"]
        r = api_client.get(f"{API}/marks/stats", params={"studentClass": sc})
        assert r.status_code == 200
        data = r.json()
        # Top-level keys
        for k in ("overall", "bySubject", "grades", "topStudents", "compare"):
            assert k in data
        ov = data["overall"]
        for k in ("totalEntries", "averagePct", "highestPct", "lowestPct", "passCount", "failCount"):
            assert k in ov

        # With our seeded values (95, 50, 20 in Math; 80, 40, 25 in Science) all out of 100:
        # passCount = entries with pct >= 33 = (95,50,80,40) = 4
        # failCount = entries with pct < 33 = (20,25) = 2
        assert ov["totalEntries"] == 6
        assert ov["highestPct"] == 95
        assert ov["lowestPct"] == 20
        assert ov["passCount"] == 4
        assert ov["failCount"] == 2

        # bySubject contains Math + Science with counts == 3 each
        subj_map = {s["subject"]: s for s in data["bySubject"]}
        assert "Math" in subj_map and "Science" in subj_map
        assert subj_map["Math"]["count"] == 3
        assert subj_map["Science"]["count"] == 3

        # topStudents sorted desc by pct, len <= 10
        assert len(data["topStudents"]) <= 10
        pcts = [s["pct"] for s in data["topStudents"]]
        assert pcts == sorted(pcts, reverse=True)

    def test_stats_compare_two_exams(self, api_client, test_students):
        sc = test_students["studentClass"]
        r = api_client.get(f"{API}/marks/stats", params={
            "studentClass": sc, "compareExamA": "Midterm", "compareExamB": "Final"
        })
        assert r.status_code == 200
        data = r.json()
        compare = data.get("compare")
        assert isinstance(compare, list) and len(compare) > 0
        for row in compare:
            assert "subject" in row
            assert "Midterm" in row and "Final" in row

    def test_stats_no_compare_returns_none(self, api_client, test_students):
        sc = test_students["studentClass"]
        r = api_client.get(f"{API}/marks/stats", params={"studentClass": sc})
        assert r.status_code == 200
        assert r.json()["compare"] is None


# ---------- Parent dashboard now includes 'marks' ----------
class TestParentDashboardMarks:
    def test_parent_dashboard_includes_marks(self, api_client, test_students):
        """The parent dashboard endpoint must include a 'marks' array (new key)."""
        sid = test_students["students"][0]["id"]
        r = api_client.get(f"{API}/parent/dashboard/{sid}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "marks" in data, "Parent dashboard must include 'marks' field"
        assert isinstance(data["marks"], list)
        # Student 0 had Midterm/Math + Final/Science -> 2 entries
        assert len(data["marks"]) == 2
        subjects = {m["subject"] for m in data["marks"]}
        assert subjects == {"Math", "Science"}

    def test_parent_dashboard_using_existing_ali(self, api_client):
        """Smoke-check the documented student (code 4543, Ali) returns marks array
        even if empty - guards against schema regression for production data."""
        r = api_client.get(f"{API}/students", params={"studentCode": "4543"})
        assert r.status_code == 200
        body = r.json()
        students = body.get("students", []) if isinstance(body, dict) else body
        if not students:
            pytest.skip("Student 4543 not present in this environment")
        sid = students[0]["id"]
        d = api_client.get(f"{API}/parent/dashboard/{sid}")
        assert d.status_code == 200
        assert "marks" in d.json() and isinstance(d.json()["marks"], list)
