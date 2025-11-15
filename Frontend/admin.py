# admin.py
from flask import Blueprint, render_template, request, redirect, url_for, current_app
from datetime import datetime, timezone

from .services.openai_service import embed
from .auth import admin_required

from pymongo import MongoClient
from .services.mongo_atlas_service import mongo_doc_upsert, fetch_by_id

admin_bp = Blueprint('admin', __name__)

# --- helpers (from your snippet) ---
def _iso_utc(value):
    if not value:
        return ""
    dt = value if not isinstance(value, str) else datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def approved_to_mongo(conf):
    conf_id = (conf.get("conf_id") or conf.get("_id") or "").strip().upper()
    conference_name = (conf.get("conference_name") or conf.get("title") or "").strip()
    topics = (conf.get("topics") or "").strip()
    city = (conf.get("city") or "").strip()
    country = (conf.get("country") or "").strip()

    embedding_text = " | ".join(filter(None, [conference_name, topics, city, country]))
    topic_vector = embed(embedding_text or conference_name or topics or "")

    doc = {
        "_id": conf_id,
        "embedding": topic_vector,
        "conference_name": conference_name,
        "country": country,
        "city": city,
        "deadline": _iso_utc(conf.get("deadline")),
        "start": _iso_utc(conf.get("start")),
        "end": _iso_utc(conf.get("end")),
        "topics": topics,
        "url": (conf.get("url") or "").strip(),
        "original_contributor_id": conf.get("submitter_id"),
        "time_approved_at": _iso_utc(conf.get("time_approved_at")),
    }

    client = MongoClient(current_app.config["MONGO_URI"])

    coll = client["kubishi-scholar"]["conferences"]
    mongo_doc_upsert(coll, doc)  
    client.close()


def _load_submissions():
    with MongoClient(current_app.config["MONGO_URI"]) as client:
        return list(client["kubishi-scholar"]["user_submitted_conf"].find())


@admin_bp.route("/conf_approval", methods=["GET", "POST"]) 
@admin_required
def conf_approval_page():
    if request.method == "POST":
        conf_id = (request.form.get("_id") or "").strip().upper()
        action  = request.form.get("action")

        existing = fetch_by_id(
            uri=current_app.config["MONGO_URI"],
            db_name="kubishi-scholar",
            collection_name="user_submitted_conf",
            doc_id=conf_id
        )
        if not existing:
            return redirect(url_for("admin.conf_approval_page"))

        client = MongoClient(current_app.config["MONGO_URI"])
        submissions_coll = client["kubishi-scholar"]["user_submitted_conf"]

        if action == "compare":
            res = fetch_by_id(
                uri=current_app.config["MONGO_URI"],
                db_name="kubishi-scholar",
                collection_name="conferences",
                doc_id=conf_id
            )
            submissions = _load_submissions()
            return render_template(
                "conf_approval.html",
                submissions=submissions,
                compare_id=conf_id,
                original_version=res
            )

        if action == "approve":
            existing["status"] = "approved"
            existing["time_approved_at"] = datetime.now(timezone.utc).isoformat()
            mongo_doc_upsert(submissions_coll, existing)
        elif action == "unapprove":
            existing["status"] = "waiting"
            existing["time_approved_at"] = None
            mongo_doc_upsert(submissions_coll, existing)
        elif action == "delete":
            submissions_coll.delete_one({"_id": existing["_id"]})

        client.close()

        return redirect(url_for("admin.conf_approval_page"))

    submissions = _load_submissions()
    return render_template(
        "conf_approval.html",
        submissions=submissions,
        compare_id=None,
        original_version=None
    )


@admin_bp.route("/submit_all_approved", methods=["POST"])
@admin_required
def submit_all_approved():
    client = MongoClient(current_app.config["MONGO_URI"])
    collection = client["kubishi-scholar"]["user_submitted_conf"]
    approved = list(collection.find({"status": "approved"}))

    for conf in approved:
        conf["status"] = "submitted"
        approved_to_mongo(conf)
        collection.update_one(
            {"_id": conf["_id"]},
            {"$set": {"status": "submitted"}}
        )

    print("CHACHING Approved ")
    client.close()
    return redirect(url_for("admin.conf_approval_page"))
