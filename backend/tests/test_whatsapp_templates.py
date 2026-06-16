"""Tests for super-admin WhatsApp templates feature.

Covers:
- GET /api/settings/whatsapp-templates default shape
- PUT /api/settings/whatsapp-templates validation (400 on bad JSON)
- PUT then GET round-trip (preserves '{student_name}' substring)
- _substitute_placeholders helper (nested dict/list/str)
- send_absent_message uses custom template when configured, defaults otherwise
"""
import os
import sys
import json
import asyncio
import pytest
import requests

# Make backend importable
sys.path.insert(0, "/app/backend")

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        try:
            with open("/app/frontend/.env") as fh:
                for line in fh:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except FileNotFoundError:
            pass
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL is not configured")
    return url.rstrip("/")


BASE_URL = _load_backend_url()
TPL_URL = f"{BASE_URL}/api/settings/whatsapp-templates"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def cleanup_templates(client):
    """Ensure templates are cleared before and after tests."""
    empty = {
        "absent": {"name": "", "componentsJson": ""},
        "fee_paid": {"name": "", "componentsJson": ""},
        "event": {"name": "", "componentsJson": ""},
    }
    client.put(TPL_URL, json=empty)
    yield
    client.put(TPL_URL, json=empty)


# ---------- API endpoint tests ----------
class TestWhatsAppTemplatesAPI:
    def test_get_default_shape(self, client):
        r = client.get(TPL_URL)
        assert r.status_code == 200
        data = r.json()
        for k in ("absent", "fee_paid", "event"):
            assert k in data
            assert data[k]["name"] == ""
            assert data[k]["componentsJson"] == ""

    def test_put_invalid_json_returns_400(self, client):
        payload = {
            "absent": {"name": "absent_v2", "componentsJson": "not json{"},
            "fee_paid": {"name": "", "componentsJson": ""},
            "event": {"name": "", "componentsJson": ""},
        }
        r = client.put(TPL_URL, json=payload)
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "Invalid JSON for absent" in detail

    def test_put_and_get_roundtrip_preserves_placeholder(self, client):
        components = [
            {"type": "body", "parameters": [
                {"type": "text", "text": "{{student_name}}"},
                {"type": "text", "text": "{{class_name}}"},
                {"type": "text", "text": "{{date}}"},
            ]}
        ]
        payload = {
            "absent": {"name": "absent_v2", "componentsJson": json.dumps(components)},
            "fee_paid": {"name": "", "componentsJson": ""},
            "event": {"name": "", "componentsJson": ""},
        }
        put_r = client.put(TPL_URL, json=payload)
        assert put_r.status_code == 200

        get_r = client.get(TPL_URL)
        assert get_r.status_code == 200
        data = get_r.json()
        assert data["absent"]["name"] == "absent_v2"
        # Placeholder substrings preserved verbatim (single-brace also preserved)
        assert "{{student_name}}" in data["absent"]["componentsJson"]
        # Parses back to identical structure
        parsed = json.loads(data["absent"]["componentsJson"])
        assert parsed == components


# ---------- Helper unit tests ----------
class TestPlaceholderSubstitution:
    def test_replaces_in_nested_structures(self):
        from services.whatsapp import _substitute_placeholders
        obj = {
            "type": "body",
            "parameters": [
                {"type": "text", "text": "Hello {{student_name}} of {{class_name}}"},
                {"type": "text", "text": "Date: {{date}}"},
                {"type": "text", "text": "no_placeholder"},
            ],
        }
        vars_dict = {"student_name": "Ali", "class_name": "1A", "date": "2026-01-15"}
        out = _substitute_placeholders(obj, vars_dict)
        assert out["parameters"][0]["text"] == "Hello Ali of 1A"
        assert out["parameters"][1]["text"] == "Date: 2026-01-15"
        assert out["parameters"][2]["text"] == "no_placeholder"

    def test_unknown_placeholder_left_intact(self):
        from services.whatsapp import _substitute_placeholders
        out = _substitute_placeholders("Hi {{unknown}}", {"student_name": "A"})
        assert out == "Hi {{unknown}}"

    def test_non_string_values_passthrough(self):
        from services.whatsapp import _substitute_placeholders
        out = _substitute_placeholders([1, 2.5, None, True, "x={{k}}"], {"k": "v"})
        assert out == [1, 2.5, None, True, "x=v"]


# ---------- send_absent_message custom-vs-default behaviour ----------
# NOTE: motor's AsyncIOMotorClient binds to the first event loop it uses.
# We therefore share a single event loop across the two async tests via a
# module-scoped fixture instead of asyncio.run() (which destroys the loop).
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


class TestSendAbsentMessageRouting:
    def test_custom_template_substituted(self, client, monkeypatch, event_loop):
        # Configure a custom template
        components = [
            {"type": "body", "parameters": [
                {"type": "text", "text": "Hi {{student_name}}"},
                {"type": "text", "text": "Class {{class_name}}"},
                {"type": "text", "text": "On {{date}}"},
            ]}
        ]
        client.put(TPL_URL, json={
            "absent": {"name": "absent_v2", "componentsJson": json.dumps(components)},
            "fee_paid": {"name": "", "componentsJson": ""},
            "event": {"name": "", "componentsJson": ""},
        })

        import services.whatsapp as wa

        captured = {}

        async def fake_send(mobile, name, comps, settings=None):
            captured["mobile"] = mobile
            captured["name"] = name
            captured["components"] = comps
            return {"success": True}

        monkeypatch.setattr(wa, "send_wa_template", fake_send)

        event_loop.run_until_complete(wa.send_absent_message(
            "+919999999999", "Ali", "1A", "2026-01-15",
            settings={"phoneNumberId": "x", "accessToken": "y"},
        ))

        assert captured["name"] == "absent_v2"
        body = captured["components"][0]["parameters"]
        texts = [p["text"] for p in body]
        assert texts == ["Hi Ali", "Class 1A", "On 2026-01-15"]
        # No raw placeholders remain
        flat = json.dumps(captured["components"])
        assert "{{student_name}}" not in flat
        assert "{{class_name}}" not in flat
        assert "{{date}}" not in flat

    def test_default_template_when_cleared(self, client, monkeypatch, event_loop):
        # Clear template
        client.put(TPL_URL, json={
            "absent": {"name": "", "componentsJson": ""},
            "fee_paid": {"name": "", "componentsJson": ""},
            "event": {"name": "", "componentsJson": ""},
        })

        import services.whatsapp as wa

        captured = {}

        async def fake_send(mobile, name, comps, settings=None):
            captured["name"] = name
            captured["components"] = comps
            return {"success": True}

        monkeypatch.setattr(wa, "send_wa_template", fake_send)

        event_loop.run_until_complete(wa.send_absent_message(
            "+919999999999", "Ali", "1A", "2026-01-15",
            settings={"phoneNumberId": "x", "accessToken": "y"},
        ))

        assert captured["name"] == "absent_hifg"
        body_params = captured["components"][0]["parameters"]
        assert body_params == [
            {"type": "text", "text": "Ali"},
            {"type": "text", "text": "1A"},
            {"type": "text", "text": "2026-01-15"},
        ]
