# admin.py
from flask import Blueprint, render_template, request, redirect, url_for
from datetime import datetime, timezone

from .services.db_services import db
from .models import Submitted_Conferences
from .services.pinecone_service import fetch_by_id, upsert_vector
from .services.openai_service import embed

admin_bp = Blueprint("admin", __name__)

# --- helpers (from your snippet) ---
def _iso_utc(dt):
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

def approved_to_pinecone(conf):
    topic_vector = embed(conf.topics or "")
    updated_vector = {
        "id": conf.conf_id,
        "values": topic_vector,
        "metadata": {
            "conference_name": (conf.conference_name or "").strip(),
            "country": (conf.country or "").strip(),
            "city": (conf.city or "").strip(),
            "deadline": _iso_utc(conf.deadline),
            "start": _iso_utc(conf.start),
            "end": _iso_utc(conf.end),
            "topics": (conf.topics or "").strip(),
            "url": (conf.url or "").strip(),
            "original_contributor_id": conf.submitter_id,
            "status": conf.status,
        }
    }
    upsert_vector(updated_vector)

# --- routes (just these) ---
@admin_bp.route("/conf_approval", methods=["GET", "POST"])
def conf_approval_page():
    if request.method == "POST":
        conf_id = request.form.get("conf_id")
        action  = request.form.get("action")

        conf = db.session.query(Submitted_Conferences).filter_by(conf_id=conf_id).first()
        if not conf:
            return redirect(url_for("admin.conf_approval_page"))

        if action == "compare":
            res = fetch_by_id(conf_id)
            vec = res.vectors.get(conf_id) if res else None
            pine_meta = vec.metadata if vec else None

            submissions = db.session.query(Submitted_Conferences).all()
            return render_template(
                "conf_approval.html",
                submissions=submissions,
                compare_id=conf_id,
                pine_meta=pine_meta
            )

        if action == "approve":
            conf.status = "approved"; conf.time_approved_at = datetime.now(); db.session.commit()
        elif action == "unapprove":
            conf.status = "waiting"; conf.time_approved_at = None; db.session.commit()
        elif action == "delete":
            db.session.delete(conf); db.session.commit()

        return redirect(url_for("admin.conf_approval_page"))

    submissions = db.session.query(Submitted_Conferences).all()
    return render_template("conf_approval.html", submissions=submissions, compare_id=None, pine_meta=None)

@admin_bp.route("/submit_all_approved", methods=["POST"])
def submit_all_approved():
    approved = Submitted_Conferences.query.filter_by(status="approved").all()
    for conf in approved:
        conf.status = "submitted"
        approved_to_pinecone(conf)
    db.session.commit()
    return redirect(url_for("admin.conf_approval_page"))
