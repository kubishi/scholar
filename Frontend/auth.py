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
        if not uid:
            return jsonify({"ok": False, "error": "auth_required"}), 401
        u = User.query.filter_by(google_auth_id=uid).first()
        role = str(getattr(u, "user_privelages", getattr(u, "user_privileges", ""))).lower() if u else ""
        if role != "admin":
            return jsonify({"ok": False, "error": "forbidden", "detail": "admin_only"}), 403
        g.current_user = u
        return view(*a, **k)
    return wrapper
