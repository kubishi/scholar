from flask import Blueprint, flash, redirect, render_template, session, url_for, request, jsonify, current_app
from datetime import datetime

from .auth import login_required # type: ignore
from .forms import ConferenceForm # type: ignore
from .models import User, Favorite_Conf, Submitted_Conferences # type: ignore
from .services.openai_service import embed # type: ignore
from .services.db_services import db # type: ignore
from .services.mongo_atlas_service import fetch_by_id
from pymongo import MongoClient


bp = Blueprint("conferences", __name__) 

#edit page
@bp.route('/edit_conf/<conf_id>', methods=['GET', 'POST'])
@login_required
def edit_conference(conf_id):
    existing = fetch_by_id(conf_id)
    if not existing.vectors:
        return f"Conference ID {conf_id} not found", 404

    conf_meta = existing.vectors[conf_id].metadata

    def parse_date(date_str):
        if date_str:
            try:
                return datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                return None
        return None

    form = ConferenceForm(
        conference_id=conf_id,
        conference_name=conf_meta.get("conference_name"),
        country=conf_meta.get("country", ""),
        city=conf_meta.get("city", ""),
        deadline=parse_date(conf_meta.get("deadline", "")),
        start=parse_date(conf_meta.get("start", "")),
        end=parse_date(conf_meta.get("end", "")),
        topic_list=conf_meta.get("topics", ""),
        conference_link=conf_meta.get("url", "")
    )

    # Handle form submission
    if request.method == 'POST':
        print("POST data:", request.form.to_dict(), "\n")
        print("Errors:", form.errors)

    if form.validate_on_submit():
        # Create a new "edit submission" record in DB
        updated_submission = Submitted_Conferences(
            conf_id=conf_id,
            submitter_user_name=session['user']['userinfo'].get('name', ''),
            submitter_id=session['user']['userinfo']['sub'],
            status='waiting',  # pending approval
            edit_type='edit',
            conference_name=form.conference_name.data.strip(),
            country=form.country.data.strip(),
            city=form.city.data.strip(),
            deadline=form.deadline.data,
            start=form.start.data,
            end=form.end.data,
            topics=form.topic_list.data.strip(),
            url=form.conference_link.data.strip(),
            time_submitted_at=datetime.now().isoformat()
        )

        db.session.add(updated_submission)
        db.session.commit()

        print("Conference edit submitted successfully! Pending approval.", "success")
        return redirect(url_for("index"))

    return render_template("edit_conference.html", form=form, conf_id=conf_id)
  
#ADD CONFERENCES PAGE
@bp.route('/add_conf', methods=['GET', 'POST'])
@login_required
def conference_adder():
    form = ConferenceForm()
    if form.validate_on_submit():
        conference_id = form.conference_id.data.strip().upper()

        new_submission = Submitted_Conferences(
            conf_id=conference_id,
            submitter_user_name=session['user']['userinfo'].get('name', ''),
            submitter_id=session['user']['userinfo']['sub'],
            status='waiting',
            edit_type='new',
            conference_name=form.conference_name.data.strip(),
            country=form.country.data.strip(),
            city=form.city.data.strip(),
            deadline=form.deadline.data,
            start=form.start.data,
            end=form.end.data,
            topics=form.topic_list.data.strip(),
            url=form.conference_link.data.strip(),
            time_submitted_at=datetime.now().isoformat()
        )

        db.session.add(new_submission)
        db.session.commit()

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
        # Log only domains or counts in prod to avoid PII leakage
        current_app.logger.debug("Found %d matching users for connection search.", len(searched_user_info))
    else:
        current_app.logger.debug("No user found for connection search input provided.")

    return render_template('friend_search.html', searched_user_info=searched_user_info, logged_in_user_id = logged_in_user_id, session_user_name=session.get('user'))

@bp.route("/saved_conference")
@login_required
def saved_conference():
    logged_in_user_id = session.get("user_id")

    favorite_ids = MongoClient(current_app.config["MONGO_URI"])["kubishi-scholar"]["users"].find_one({"_id": logged_in_user_id})["favorites"]
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
