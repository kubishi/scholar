from functools import wraps
from flask import session, jsonify, current_app
from pymongo import MongoClient


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
        
        # Check MongoDB for admin status
        client = MongoClient(current_app.config["MONGO_URI"])
        try:
            user_doc = client["kubishi-scholar"]["users"].find_one({"_id": uid})
            if not user_doc:
                print(f"DEBUG: User not found in MongoDB for uid: {uid}")
                return jsonify({"ok": False, "error": "auth_required"}), 401
            
            role = (user_doc.get("user_privilege") or "").strip().lower()
            print(f"DEBUG: User {uid} has role: '{role}' (raw: {user_doc.get('user_privilege')})")
            if role != "admin":
                return jsonify({"ok": False, "error": "forbidden", "detail": "admin_only"}), 403
            return view(*a, **k)
        finally:
            client.close()
    return wrapper
