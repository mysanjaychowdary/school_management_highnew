"""SMS gateway service (websms.aspx-style HTTP API)."""
import logging
import re
import httpx
from db import db

logger = logging.getLogger(__name__)


SMS_API_URL = "http://97.74.92.177/websms/sendsms.aspx"


async def get_sms_settings():
    settings = await db.settings.find_one({"type": "sms"}, {"_id": 0})
    if not settings or not settings.get('userid') or not settings.get('password') or not settings.get('sender') or not settings.get('peid'):
        return None
    return settings


async def get_channel():
    """Which channel(s) notifications should go out on: 'sms' | 'whatsapp' | 'both'."""
    doc = await db.settings.find_one({"type": "notification_channel"}, {"_id": 0})
    return (doc or {}).get("channel", "whatsapp")


def _substitute_placeholders(text, vars_dict):
    """Replace {{key}} placeholders in a plain-text SMS template using vars_dict."""
    def repl(m):
        key = m.group(1).strip()
        return str(vars_dict.get(key, m.group(0)))
    return re.sub(r"\{\{\s*([^}]+?)\s*\}\}", repl, text)


async def _get_custom_template(event_key):
    """Return (message_template, tpid, enabled) for this event's SMS template.
    Returns (None, None, enabled_flag) when message/tpid are missing — SMS has no
    hardcoded default since a DLT template id can't be invented by the system."""
    doc = await db.settings.find_one({"type": "sms_templates"}, {"_id": 0})
    if not doc:
        return None, None, True
    t = doc.get(event_key) or {}
    enabled = t.get("enabled", True)
    if enabled is None:
        enabled = True
    message = (t.get("message") or "").strip()
    tpid = (t.get("tpid") or "").strip()
    if not message or not tpid:
        return None, None, enabled
    return message, tpid, enabled


async def send_sms(mobile, message, tpid, settings=None):
    """Send a single SMS via the configured gateway."""
    try:
        if not settings:
            settings = await get_sms_settings()
        if not settings:
            return {"success": False, "message": "SMS not configured"}
        params = {
            "userid": settings['userid'],
            "password": settings['password'],
            "sender": settings['sender'],
            "mobileno": mobile,
            "msg": message,
            "peid": settings['peid'],
            "tpid": tpid,
        }
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(SMS_API_URL, params=params, timeout=30.0)
            logger.info(f"SMS sent to {mobile}: {response.status_code} {response.text[:200]}")
            return {"success": True, "data": response.text}
    except Exception as e:
        logger.error(f"SMS send failed: {str(e)}")
        return {"success": False, "message": str(e)}


async def _send_custom_or_skip(event_key, vars_dict, mobile, settings=None):
    """Substitute placeholders into the admin-configured template and send.
    Skips (no default fallback) when disabled or when no template/tpid is configured."""
    message_tpl, tpid, enabled = await _get_custom_template(event_key)
    if not enabled:
        return {"success": False, "message": f"{event_key} SMS disabled by admin", "skipped": True}
    if not message_tpl or not tpid:
        return {"success": False, "message": f"No SMS template configured for {event_key}", "skipped": True}
    message = _substitute_placeholders(message_tpl, vars_dict)
    return await send_sms(mobile, message, tpid, settings)


async def send_sms_absent(mobile, student_name, class_name, date_str, settings=None):
    vars_dict = {"student_name": student_name, "class_name": class_name, "date": date_str}
    return await _send_custom_or_skip("absent", vars_dict, mobile, settings)


async def send_sms_fee_paid(mobile, amount, fee_name, student_name, settings=None):
    vars_dict = {"amount": amount, "fee_name": fee_name, "student_name": student_name}
    return await _send_custom_or_skip("fee_paid", vars_dict, mobile, settings)


async def send_sms_event(mobile, event_name, event_date, settings=None):
    vars_dict = {"event_name": event_name, "event_date": event_date}
    return await _send_custom_or_skip("event", vars_dict, mobile, settings)


async def send_sms_marks(mobile, student_name, exam_name, class_name, section, marks_summary, settings=None):
    vars_dict = {
        "student_name": student_name,
        "exam_name": exam_name,
        "class_name": class_name,
        "section": section,
        "marks_summary": marks_summary,
    }
    return await _send_custom_or_skip("marks", vars_dict, mobile, settings)


async def send_sms_fee_reminder(mobile, student_name, fee_name, amount, due_date, settings=None):
    vars_dict = {"student_name": student_name, "fee_name": fee_name, "amount": amount, "due_date": due_date}
    return await _send_custom_or_skip("fee_reminder", vars_dict, mobile, settings)
