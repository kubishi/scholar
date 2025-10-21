from functools import wraps
from flask import session, jsonify
from .models import User


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"ok": False, "error": "auth_required"}), 401
        return view(*args, **kwargs)
    return wrapper

def admin_required(view):
    @wraps(view)
    def wrapper(*a, **k):
        uid = session.get("user_id")
        u = User.query.get(uid) if uid else None   # PK lookup (google_auth_id)
        if not u:
            return jsonify({"ok": False, "error": "auth_required"}), 401
        role = (getattr(u, "user_privelages", getattr(u, "user_privileges", "")) or "").strip().lower()
        if role != "admin":
            return jsonify({"ok": False, "error": "forbidden", "detail": "admin_only"}), 403
        return view(*a, **k)
    return wrapper
