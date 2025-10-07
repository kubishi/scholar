from functools import wraps
from flask import session, jsonify

def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"ok": False, "error": "auth_required"}), 401
        return view(*args, **kwargs)
    return wrapper