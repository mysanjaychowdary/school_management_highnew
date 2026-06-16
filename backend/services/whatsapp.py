"""WhatsApp Meta Graph API service."""
import json
import logging
import re
import httpx
from datetime import datetime
from typing import Optional, Dict
from db import db

logger = logging.getLogger(__name__)



BASE_WA_URL = "https://crm.abhiit.com/api/meta/v19.0"

async def get_wa_settings():
    settings = await db.settings.find_one({"type": "whatsapp"}, {"_id": 0})
    if not settings or not settings.get('phoneNumberId') or not settings.get('accessToken'):
        return None
    return settings


def _substitute_placeholders(obj, vars_dict):
    """Recursively replace {{key}} placeholders in nested dict/list/str using vars_dict."""
    if isinstance(obj, str):
        def repl(m):
            key = m.group(1).strip()
            return str(vars_dict.get(key, m.group(0)))
        return re.sub(r"\{\{\s*([^}]+?)\s*\}\}", repl, obj)
    if isinstance(obj, list):
        return [_substitute_placeholders(x, vars_dict) for x in obj]
    if isinstance(obj, dict):
        return {k: _substitute_placeholders(v, vars_dict) for k, v in obj.items()}
    return obj


async def _get_custom_template(event_key):
    """Return (name, components_list) if super admin configured a custom template for this event, else (None, None)."""
    doc = await db.settings.find_one({"type": "whatsapp_templates"}, {"_id": 0})
    if not doc:
        return None, None
    t = doc.get(event_key) or {}
    name = (t.get("name") or "").strip()
    raw = (t.get("componentsJson") or "").strip()
    if not name or not raw:
        return None, None
    try:
        components = json.loads(raw)
        if not isinstance(components, list):
            logger.warning(f"Custom template '{event_key}' components is not a list, ignoring")
            return None, None
        return name, components
    except Exception as e:
        logger.warning(f"Failed to parse custom template JSON for {event_key}: {e}")
        return None, None


async def send_wa_template(mobile, template_name, components, settings=None):
    """Send WhatsApp template message"""
    try:
        if not settings:
            settings = await get_wa_settings()
        if not settings:
            return {"success": False, "message": "WhatsApp not configured"}
        url = f"{BASE_WA_URL}/{settings['phoneNumberId']}/messages"
        headers = {"Authorization": f"Bearer {settings['accessToken']}", "Content-Type": "application/json"}
        payload = {
            "to": mobile,
            "recipient_type": "individual",
            "type": "template",
            "template": {
                "language": {"policy": "deterministic", "code": "en"},
                "name": template_name,
                "components": components
            }
        }
        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(url, headers=headers, json=payload, timeout=30.0)
            logger.info(f"WhatsApp template '{template_name}' sent to {mobile}: {response.status_code}")
            return {"success": True, "data": response.json()}
    except Exception as e:
        logger.error(f"WhatsApp send failed: {str(e)}")
        return {"success": False, "message": str(e)}


async def _send_custom_or_default(event_key, vars_dict, default_name, default_components, mobile, settings=None):
    """If admin configured a custom template for event_key, substitute placeholders and send.
    Otherwise fall back to the default template name + components."""
    custom_name, custom_components = await _get_custom_template(event_key)
    if custom_name and custom_components is not None:
        name = custom_name
        components = _substitute_placeholders(custom_components, vars_dict)
    else:
        name = default_name
        components = default_components
    return await send_wa_template(mobile, name, components, settings)


async def send_fee_paid_message(mobile, invoice_url, amount, fee_name, student_name, settings=None):
    """Send fee paid success with invoice document"""
    vars_dict = {
        "amount": amount,
        "fee_name": fee_name,
        "student_name": student_name,
        "invoice_url": invoice_url,
    }
    default_components = [
        {"type": "header", "parameters": [{"type": "document", "document": {"link": invoice_url}}]},
        {"type": "body", "parameters": [
            {"type": "text", "text": str(amount)},
            {"type": "text", "text": fee_name},
            {"type": "text", "text": student_name}
        ]}
    ]
    return await _send_custom_or_default("fee_paid", vars_dict, "fee_paid_bill", default_components, mobile, settings)


async def send_absent_message(mobile, student_name, class_name, date_str, settings=None):
    """Send absent notification"""
    vars_dict = {
        "student_name": student_name,
        "class_name": class_name,
        "date": date_str,
    }
    default_components = [
        {"type": "body", "parameters": [
            {"type": "text", "text": student_name},
            {"type": "text", "text": class_name},
            {"type": "text", "text": date_str}
        ]}
    ]
    return await _send_custom_or_default("absent", vars_dict, "absent_hifg", default_components, mobile, settings)


async def send_event_message(mobile, event_name, event_date, settings=None):
    """Send event notification"""
    vars_dict = {
        "event_name": event_name,
        "event_date": event_date,
    }
    default_components = [
        {"type": "body", "parameters": [
            {"type": "text", "text": event_name},
            {"type": "text", "text": event_date}
        ]}
    ]
    return await _send_custom_or_default("event", vars_dict, "holi", default_components, mobile, settings)

# Backward-compat wrapper
async def send_whatsapp_message(mobile, message, settings=None):
    """Fallback text message (kept for fee reminders etc)"""
    try:
        if not settings:
            settings = await get_wa_settings()
        if not settings:
            return {"success": False, "message": "WhatsApp not configured"}
        url = f"{BASE_WA_URL}/{settings['phoneNumberId']}/messages"
        headers = {"Authorization": f"Bearer {settings['accessToken']}", "Content-Type": "application/json"}
        payload = {"to": mobile, "recipient_type": "individual", "type": "text", "text": {"body": message}}
        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(url, headers=headers, json=payload, timeout=30.0)
            return {"success": True, "data": response.json()}
    except Exception as e:
        logger.error(f"WhatsApp send failed: {str(e)}")
        return {"success": False, "message": str(e)}
