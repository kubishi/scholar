from flask import Blueprint, flash, redirect, render_template, session, url_for, request, jsonify, current_app
from datetime import datetime

from .auth import login_required # type: ignore
from .forms import ConferenceForm # type: ignore
from .models import User, Favorite_Conf # type: ignore
from .services.openai_service import embed # type: ignore
from .services.db_services import db # type: ignore
from .services.pinecone_service import ( # type: ignore
    fetch_by_id,
    upsert_vector,
) 

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
    
    #Displaying the intital data
    form = ConferenceForm(
        conference_id=conf_id,
        conference_name=conf_meta.get("name", ""),
        country=conf_meta.get("country", ""),
        city=conf_meta.get("city", ""),
        deadline=parse_date(conf_meta.get("deadline", "")),
        start=parse_date(conf_meta.get("start", "")),
        end=parse_date(conf_meta.get("end", "")),
        topic_list=conf_meta.get("topics", ""),
        conference_link=conf_meta.get("url", "")
    )

    if form.validate_on_submit():
        #print("Form validated successfully.")
        topic_vector = embed(form.topic_list.data)

        updated_vector = {
            "id": conf_id,
            "values": topic_vector,
            "metadata": {
                "conference_name": form.conference_name.data.strip(),
                "country": form.country.data.strip(),
                "city": form.city.data.strip(),
                "deadline": form.deadline.data.strftime("%Y-%m-%dT%H:%M:%SZ") if form.deadline.data else "",
                "start": form.start.data.strftime("%Y-%m-%dT%H:%M:%SZ") if form.start.data else "",
                "end": form.end.data.strftime("%Y-%m-%dT%H:%M:%SZ") if form.end.data else "",
                "topics": form.topic_list.data.strip(),
                "url": form.conference_link.data.strip(),
                "contributer": session['user']['userinfo']['sub'],
            }
        }
        upsert_vector(updated_vector)
        flash("Conference updated successfully!", "success")
        return redirect(url_for("index"))
    
    return render_template("edit_conference.html", form=form, conf_id=conf_id)
  
# ENTER CONFERENCES PAGE
@bp.route('/add_conf', methods=['GET', 'POST'])
@login_required
def conference_adder():
    form = ConferenceForm()
    if form.validate_on_submit():
        topic_vector = embed(form.topic_list.data)
        
        conference_id = form.conference_id.data.strip().upper()
        conference_name = form.conference_name.data.strip()
        country = form.country.data.strip()
        city = form.city.data.strip()
        deadline = form.deadline.data.strftime("%Y-%m-%dT%H:%M:%SZ") if form.deadline.data else ""
        start = form.start.data.strftime("%Y-%m-%dT%H:%M:%SZ") if form.start.data else ""
        end = form.end.data.strftime("%Y-%m-%dT%H:%M:%SZ") if form.end.data else ""
        topic_list = form.topic_list.data.strip()
        conference_link = form.conference_link.data.strip()

        if conference_id:
            topic_vector = embed(topic_list)

            vector = {
                "id": conference_id,
                "values": topic_vector,
                "metadata": {
                    "conference_name": conference_name,
                    "country": country,
                    "city": city,
                    "deadline": deadline,
                    "start": start,
                    "end": end,
                    "topics": topic_list,
                    "url": conference_link,
                    "contributer": session['user']['userinfo']['sub'],
                }
            }
            upsert_vector(vector)
            flash("Conference added successfully!", "success")
            return redirect(url_for("index"))  # redirect after POST

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
    favorited_rows = db.session.query(Favorite_Conf).filter_by(user_id=logged_in_user_id).all()
    favorited_ids = [fav.fav_conf_id for fav in favorited_rows]

    articles = []

    if favorited_ids:
        for conf_id in favorited_ids:
            pinecone_response = fetch_by_id(conf_id.strip())
            if conf_id in pinecone_response.vectors:
                vector_data = pinecone_response.vectors[conf_id]
                articles.append({
                    "id": conf_id,
                    "metadata": vector_data.metadata,
                    "score": vector_data.metadata.get("score", 0),
                    "favorited": True  # optional, your template can use this too
                })

    return render_template(
        'saved_conference.html',
        logged_in_user_id=logged_in_user_id,
        articles=articles,
        favorite_ids=favorited_ids,  # <-- pass this so template knows which are favorited
        session_user_name=session.get('user')
    )