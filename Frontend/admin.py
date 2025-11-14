# admin.py
from flask import Blueprint, render_template, request, redirect, url_for, current_app
from datetime import datetime, timezone

from .services.db_services import db
from .models import Submitted_Conferences
from .services.openai_service import embed
from .auth import admin_required

from pymongo import MongoClient
from .services.mongo_atlas_service import mongo_doc_upsert, fetch_by_id

admin_bp = Blueprint('admin', __name__)

# --- helpers (from your snippet) ---
def _iso_utc(dt):
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

def approved_to_mongo(conf):
    topic_vector = embed(conf.topics or "")
    doc = {
        "_id": (conf.conf_id or "").strip().upper(),
        "embedding": topic_vector,
        "conference_name": (conf.conference_name or "").strip(),
        "country": (conf.country or "").strip(),
        "city": (conf.city or "").strip(),
        "deadline": _iso_utc(conf.deadline),
        "start": _iso_utc(conf.start),
        "end": _iso_utc(conf.end),
        "topics": (conf.topics or "").strip(),
        "url": (conf.url or "").strip(),
        "original_contributor_id": conf.submitter_id,
        "time_approved_at": _iso_utc(conf.time_approved_at),
        "status": conf.status,
    }

    client = MongoClient(current_app.config["MONGO_URI"])

    coll = client["kubishi-scholar"]["conferences"]
    mongo_doc_upsert(coll, doc)  
    client.close()


@admin_bp.route("/conf_approval", methods=["GET", "POST"]) 
@admin_required
def conf_approval_page():
    if request.method == "POST":
        conf_id = (request.form.get("conf_id") or "").strip().upper()  # normalize
        action  = request.form.get("action")

        existing = fetch_by_id(
            uri=current_app.config["MONGO_URI"],   # inside fetch_by_id use MongoClient(uri) positionally
            db_name="kubishi-scholar",
            collection_name="user_submitted_conf",
            doc_id=conf_id
        )
        if not existing:
            return redirect(url_for("admin.conf_approval_page"))

        if action == "compare":
            # fetch previous (Mongo) version by _id
            res = fetch_by_id(
                uri=current_app.config["MONGO_URI"],   # inside fetch_by_id use MongoClient(uri) positionally
                db_name="kubishi-scholar",
                collection_name="conferences",
                doc_id=conf_id
            )
            submissions = db.session.query(Submitted_Conferences).all()
            return render_template(
                "conf_approval.html",
                submissions=submissions,
                compare_id=conf_id,
                original_version=res        # <-- pass this to Jinja
            )

        if action == "approve":
            conf.status = "approved"
            conf.time_approved_at = datetime.now(timezone.utc)
            db.session.commit()
        elif action == "unapprove":
            conf.status = "waiting"
            conf.time_approved_at = None
            db.session.commit()
        elif action == "delete":
            db.session.delete(conf)
            db.session.commit()

        return redirect(url_for("admin.conf_approval_page"))

    submissions = db.session.query(Submitted_Conferences).all()
    return render_template(
        "conf_approval.html",
        submissions=submissions,
        compare_id=None,
        original_version=None     # optional, keeps template happy
    )


@admin_bp.route("/submit_all_approved", methods=["POST"])
@admin_required
def submit_all_approved():
    approved = Submitted_Conferences.query.filter_by(status="approved").all()

    for conf in approved:
        conf.status = "submitted"
        approved_to_mongo(conf)
    db.session.commit() 
    print("CHACHING Approved ")
    return redirect(url_for("admin.conf_approval_page"))
