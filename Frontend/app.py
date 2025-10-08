from flask import Flask, redirect, render_template, session, url_for, request, jsonify
from datetime import datetime, timezone
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from authlib.integrations.flask_client import OAuth
from flask_wtf import CSRFProtect
from PyPDF2 import PdfReader

from .config import Config # type: ignore
from .filters import is_match, redirect_clean_params, city_country_filter, to_gcal_datetime_filter, format_date, convert_date_format # type: ignore
from .forms import ConferenceForm # type: ignore
from .services.openai_service import embed # type: ignore
from .models import User, Favorite_Conf, Submitted_Conferences # type: ignore
from .services.db_services import db, migrate # type: ignore
from .services.pinecone_service import (
    describe_count,
    semantic_query,
    id_query,
    fetch_by_id,
    upsert_vector,
) # type: ignore

# --Flask App setup---
app = Flask(__name__)
app.config.from_object(Config)

csrf = CSRFProtect(app)

@app.route("/file-upload", methods=["POST"])
def upload_file():
    file = request.files['file']
    reader = PdfReader(file)

    # Only extract text from the first page
    first_page = reader.pages[0]
    extracted_text = first_page.extract_text()

    print(extracted_text)
    return jsonify({"text": extracted_text})

# ---SQL Database Setup---
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"mysql+pymysql://{app.config['DB_USER']}:{app.config['DB_PASSWORD']}"
    f"@{app.config['DB_HOST']}:{app.config['DB_PORT']}/{app.config['DB_NAME']}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)
migrate.init_app(app, db)

# Auth0 Setup
oauth = OAuth(app)
oauth.register(
    "auth0",
    client_id=app.config["AUTH0_CLIENT_ID"],
    client_secret=app.config["AUTH0_CLIENT_SECRET"],
    client_kwargs={
        "scope": "openid profile email",
    },
    server_metadata_url=f'https://{app.config["AUTH0_DOMAIN"]}/.well-known/openid-configuration'
)

app.add_template_filter(city_country_filter, 'city_country')
app.add_template_filter(to_gcal_datetime_filter, 'to_gcal_datetime')
app.add_template_filter(format_date, 'format_date')

# Make User model available in templates
@app.context_processor
def inject_user_model():
    return dict(User=User)

@app.route("/login")
def login():
    return oauth.auth0.authorize_redirect(
        redirect_uri=url_for("callback", _external=True)
    )

@app.route("/callback", methods=["GET", "POST"])
def callback():
    token = oauth.auth0.authorize_access_token()

    # print("TONEKKKKKKKKN", token["id_token"])
    session["user"] = token
    user_info = token["userinfo"]

    google_auth_id = user_info['sub']
    user_name = user_info['name']
    user_email = user_info['email']
    print("PERSON NAME", session['user'])

    session["user_id"] = google_auth_id

    user = User.query.filter_by(google_auth_id=google_auth_id).first()
    if not user:
        new_user = User(google_auth_id=google_auth_id, user_name=user_name, user_email=user_email)
        db.session.add(new_user)
    else:
        # Optionally update existing user info
        user.user_name = user_name
        user.user_email = user_email

    db.session.commit() 

    return redirect("/")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(
        "https://" + app.config["AUTH0_DOMAIN"]
        + "/v2/logout?"
        + urlencode(
            {
                "returnTo": url_for("index", _external=True),
                "client_id": app.config["AUTH0_CLIENT_ID"],
            },
            quote_via=quote_plus,
        )
    )

def fetch_record_count():
    return describe_count()

# def is_admin():
#     """Check if the current user has admin privileges."""
#     if not session.get("user_id"):
#         return False
    
#     user = User.query.filter_by(google_auth_id=session["user_id"]).first()
#     return user and user.user_privelages == "admin"

# def require_admin(f):
#     """Decorator to require admin privileges for a route."""
#     from functools import wraps
    
#     @wraps(f)
#     def decorated_function(*args, **kwargs):
#         if not is_admin():
#             return redirect(url_for("index"))
#         return f(*args, **kwargs)
#     return decorated_function

# MAIN PAGE
@app.route("/")
def index():
    redirect_response = redirect_clean_params("index")
    favorite_ids = set()
    if session.get("user_id"):
        rows = (db.session.query(Favorite_Conf.fav_conf_id)
                .filter_by(user_id=session["user_id"])
                .all())
        favorite_ids = {r[0] for r in rows}  # {'CONF123', 'NIPS2026', ...}
    if redirect_response:
        return redirect_response
    
    record_count = fetch_record_count()
    
    query = request.args.get("query", "")
    location = request.args.get("location", "").strip().lower()
    ranking_source = request.args.get("ranking_source", "").strip().lower()
    ranking_score = request.args.get("ranking_score", "").strip().upper()
    
    ID_query = request.args.get("ID_query", "").upper()
    date_span_first = convert_date_format(request.args.get("date_span_first"))
    date_span_second = convert_date_format(request.args.get("date_span_second"))

    try:
        num_results = int(request.args.get("num_results", 10))
    except ValueError:
        num_results = 10

    advanced_open = any([
        date_span_first,
        date_span_second,
        location,
        ranking_source,
        ranking_score
    ])
    
    articles = []
    
    if ID_query:
        results = id_query(ID_query)
        articles = results.get("matches", [])

    elif query:
        try:
            # Step 1: Get embedding
            vector = embed(query)

            # Step 2: Query Pinecone
            results = semantic_query(vector, top_k=50, include_metadata=True)
            all_articles = results.get("matches", [])

            # Step 3: Filter if any filters are set
            if date_span_first and date_span_second or location or ranking_score:
                try:
                    start_date = (
                        datetime.strptime(date_span_first, "%m-%d-%Y")
                        if date_span_first else None
                    )
                    end_date = (
                        datetime.strptime(date_span_second, "%m-%d-%Y")
                        if date_span_second else None
                    )
      
                    articles = list(filter(
                                    lambda a: is_match(a, start_date, end_date, location, ranking_source, ranking_score),
                                    all_articles
                                    ))
                except Exception as e:
                    print(f"Filtering error: {e}")
                    articles = all_articles
            else:
                articles = all_articles
            
        except Exception as e:
            print(f"Error processing query: {e}")
        
        # Truncate based on num_results
        articles = articles[:num_results]

    return render_template("index.html", 
                           articles=articles,
                           favorite_ids=favorite_ids,
                           query=query,
                           ID_query=ID_query,  
                           num_results=num_results,
                           date_span_first=date_span_first,
                           date_span_second=date_span_second,
                           session_user_name=session.get('user'),
                           record_count = record_count,
                           advanced_open=advanced_open,
                           location=location,
                           ranking_source=ranking_source,
                           pretty=json.dumps(session.get('user'), indent=4) if session.get('user') else None)



@app.route('/edit_conf/<conf_id>', methods=['GET', 'POST'])
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
            status='waiting',         # pending approval
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
  
# ENTER CONFERENCES PAGE
@app.route('/add_conf', methods=['GET', 'POST'])
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

@app.route("/connection_search")
def connection_finder():
    connection_email_search_result = request.args.get("connection_email_search", "")
    searched_user_info = []
    logged_in_user_id = session.get("user_id")

    # search for similar emails (starting with what user typed)
    if connection_email_search_result:
        searched_user_info = (
            db.session.query(User)
            .filter(User.user_email.like(f"{connection_email_search_result}%"))
            .limit(5)
            .all()
        )
    
    if searched_user_info:
        for u in searched_user_info:
            app.logger.info(f"{u.user_name}, {u.user_email}")

    else:
        app.logger.info("No user found with that email.")

    return render_template('friend_search.html', searched_user_info=searched_user_info, logged_in_user_id = logged_in_user_id, session_user_name=session.get('user'))
    # return jsonify([{"name": u.user_name, "email": u.user_email} for u in searched_user_info])

@app.route("/saved_conference")
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

@app.route("/favorite", methods=["POST"])
def save_favorite():
    if "user_id" not in session:
        return jsonify({"ok": False, "error": "auth_required"}), 401

    data = request.get_json(silent=True) or {}
    conf_id = data.get("conference_id") or data.get("conf_id")
    print(conf_id)
    if not conf_id:
        return jsonify({"ok": False, "error": "missing_conference_id"}), 400

    user_id = session["user_id"]
    fav = Favorite_Conf.query.filter_by(user_id=user_id, fav_conf_id=conf_id).first()
    if fav:
        db.session.delete(fav)
        db.session.commit()
        status = "removed"
    else:
        db.session.add(Favorite_Conf(user_id=user_id, fav_conf_id=conf_id))
        db.session.commit()
        status = "added"

    return jsonify({"ok": True, "status": status, "conf_id": conf_id})



@app.route("/conf_approval", methods=["GET", "POST"])
# @require_admin
def conf_approval_page():

    if request.method == "POST":
        conf_id = request.form.get("conf_id")
        action  = request.form.get("action")

        conf = db.session.query(Submitted_Conferences).filter_by(conf_id=conf_id).first()
        if not conf:
            return redirect(url_for("conf_approval_page"))

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

        return redirect(url_for("conf_approval_page"))


    submissions = db.session.query(Submitted_Conferences).all()
    return render_template("conf_approval.html", submissions=submissions, compare_id=None, pine_meta=None) # None makes sure you can't see the stuff on load


def _iso_utc(dt):
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

def approved_to_pinecone(conf):
    topic_vector = embed(conf.topics)  

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
            "original_contributor_id": conf.submitter_id,  # keep original key if needed
            "status": conf.status,
        }
    }
    upsert_vector(updated_vector)



@app.route("/submit_all_approved", methods=["POST"])
def submit_all_approved():
    approved = Submitted_Conferences.query.filter_by(status="approved").all()
    for conf in approved:
        conf.status = "submitted"
        approved_to_pinecone(conf)
    print(f"Submitted {len(approved)} approved conferences.", "success")
    return redirect(url_for("conf_approval_page"))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env.get("PORT", 3000)), debug=Config.FLASK_DEBUG)