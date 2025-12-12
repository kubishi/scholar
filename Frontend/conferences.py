from flask import Blueprint, flash, redirect, render_template, session, url_for, request, jsonify, current_app
from datetime import datetime, timezone

from .auth import login_required # type: ignore
from .forms import ConferenceForm # type: ignore
from .models import User, Favorite_Conf, Submitted_Conferences # type: ignore
from .services.openai_service import embed # type: ignore
from .services.db_services import db # type: ignore
from .services.mongo_atlas_service import fetch_by_id
from .services.mongo_users import upsert_user
from datetime import datetime, timezone, date
from pymongo import MongoClient


bp = Blueprint("conferences", __name__) 

def _to_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        # assume ISO format YYYY-MM-DD or timestamp string
        return datetime.fromisoformat(value).date()
    except (ValueError, TypeError):
        return None

#edit page
@bp.route('/edit_conf/<conf_id>', methods=['GET', 'POST'])
@login_required
def edit_conference(conf_id):

    existing = fetch_by_id(
        uri=current_app.config["MONGO_URI"],   # inside fetch_by_id use MongoClient(uri) positionally
        db_name="kubishi-scholar",
        collection_name="conferences",
        doc_id=conf_id
    )
    if not existing:
        return f"Conference ID {conf_id} not found", 404

    # Pre-Fill with old information
    form = ConferenceForm(
        conference_id = existing.get("_id"),
        title = existing.get("title", ""),
        country = existing.get("country", ""),
        city = existing.get("city", ""),
        deadline = _to_date(existing.get("deadline", None)),
        start = _to_date(existing.get("start", None)),
        end = _to_date(existing.get("end", None)),
        topic_list = existing.get("topics", []),
        conference_link = existing.get("url", "")
    )

    print(form.conference_id.data)

    # Handle form submission
    if request.method == 'POST':
        print("POST data:", request.form.to_dict(), "\n")
        print("Errors:", form.errors)

    if form.validate_on_submit():
        user_info = session.get("user", {}).get("userinfo", {})
        google_auth_id = user_info.get("sub")
        user_name = user_info.get("name", "")
        user_email = user_info.get("email", "")

        if not google_auth_id:
            flash("Unable to determine user identity for submission.", "danger")
            return redirect(url_for("index"))

        submission_doc = {
            "_id": conf_id,
            "acronym": form.conference_id.data.strip(),
            "title": form.title.data.strip(),
            "country": form.country.data.strip(),
            "city": form.city.data.strip(),
            "deadline": form.deadline.data.isoformat() if form.deadline.data else None,
            "start": form.start.data.isoformat() if form.start.data else None,
            "end": form.end.data.isoformat() if form.end.data else None,
            "topics": form.topic_list.data.strip(),
            "url": form.conference_link.data.strip(),
            "submitter_user_name": user_name,
            "submitter_user_email": user_email,
            "submitter_id": google_auth_id,
            "status": "waiting",
            "edit_type": "edit",
            "time_submitted_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        }

        upsert_user(
            current_app.config["MONGO_URI"],
            "kubishi-scholar",
            "user_submitted_conf",
            submission_doc
        )

        flash("Conference edit submitted successfully! Pending approval.", "success")
        return redirect(url_for("index"))

    return render_template("edit_conference.html", form=form, conf_id=conf_id)
  
#ADD CONFERENCES PAGE
@bp.route('/add_conf', methods=['GET', 'POST'])
@login_required
def conference_adder():
    form = ConferenceForm()
    if form.validate_on_submit():
        user_info = session.get("user", {}).get("userinfo", {})
        google_auth_id = user_info.get("sub")
        user_name = user_info.get("name", "")
        user_email = user_info.get("email", "")

        if not google_auth_id:
            flash("Unable to determine user identity for submission.", "danger")
            return redirect(url_for("index"))

        submission_doc = {
            "_id": form.conference_id.data.strip(),
            "acronym": form.conference_id.data.strip(),
            "title": form.conference_name.data.strip(),
            "country": form.country.data.strip(),
            "city": form.city.data.strip(),
            "deadline": form.deadline.data.isoformat() if form.deadline.data else None,
            "start": form.start.data.isoformat() if form.start.data else None,
            "end": form.end.data.isoformat() if form.end.data else None,
            "topics": form.topic_list.data.strip(),
            "url": form.conference_link.data.strip(),
            "submitter_user_name": user_name,
            "submitter_user_email": user_email,
            "submitter_id": google_auth_id,
            "status": "waiting",
            "edit_type": "new",
            "time_submitted_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        }

        upsert_user(
            current_app.config["MONGO_URI"],
            "kubishi-scholar",
            "user_submitted_conf",
            submission_doc
        )

        print("Conference submitted successfully! Pending approval.", "success")
        return redirect(url_for("index"))

    return render_template("add_conference.html", form=form)


@bp.route("/connection_search")
def connection_finder():
    connection_email_search_result = request.args.get("connection_email_search", "")
    searched_user_info = []
    logged_in_user_id = session.get("user_id")

    # search for similar emails (starting with what user typed)
    if connection_email_search_result:
        searched_user_info = (
            db.session.query(User)
            .filter(User.user_email.ilike(f"{connection_email_search_result}%"))
            .limit(5)
            .all()
        )
    
    if searched_user_info:
        current_app.logger.debug("Found %d matching users for connection search.", len(searched_user_info))
    else:
        current_app.logger.debug("No user found for connection search input provided.")

    return render_template('friend_search.html', searched_user_info=searched_user_info, logged_in_user_id = logged_in_user_id, session_user_name=session.get('user'))

@bp.route("/saved_conference")
@login_required
def saved_conference():
    logged_in_user_id = session.get("user_id")

    favorite_ids = []
    user_id = session.get("user_id")
    if user_id:
        client = MongoClient(current_app.config["MONGO_URI"])
        users = client["kubishi-scholar"]["users"]
        user_doc = users.find_one({"_id": user_id})
        if user_doc and "favorites" in user_doc:
            favorite_ids = user_doc["favorites"]
            
    print("GGGGGG", type(favorite_ids))

    articles = []
    if favorite_ids:
        uri = current_app.config["MONGO_URI"]
        with MongoClient(uri) as client:
            coll = client["kubishi-scholar"]["conferences"]
            cursor = coll.find({"_id": {"$in": favorite_ids}})
            docs = list(cursor)

        by_id = {d["_id"]: d for d in docs}
        articles = [by_id[i] for i in favorite_ids if i in by_id]

    return render_template(
        "saved_conference.html",
        logged_in_user_id=logged_in_user_id,
        articles=articles,
        favorite_ids=favorite_ids,
        session_user_name=session.get("user"),
    )
