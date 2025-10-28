from flask import Flask, redirect, render_template, session, url_for, request, jsonify
from datetime import datetime
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from authlib.integrations.flask_client import OAuth
from flask_wtf import CSRFProtect
from PyPDF2 import PdfReader

from .auth import login_required
from .conferences import bp as conferences_bp 
from .admin import admin_bp
from .config import Config 
from .filters import is_match, redirect_clean_params, city_country_filter, to_gcal_datetime_filter, format_date, convert_date_format
from .services.openai_service import embed 
from .models import User, Favorite_Conf
from .services.openai_service import embed, pdf_summary
from .services.db_services import db, migrate

from .services.pinecone_service import (
    describe_count,
    semantic_query,
    id_query,
)  

from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from .services.mongo_atlas_service import (
    count_indexes,
    mongo_vec_query,
    fetch_by_id
)


# --- Flask App setup ---
app = Flask(__name__)
app.config.from_object(Config)

# Blueprints
app.register_blueprint(admin_bp)
app.register_blueprint(conferences_bp)

csrf = CSRFProtect(app)

# ---SQL Database Setup---
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"mysql+pymysql://{app.config['DB_USER']}:{app.config['DB_PASSWORD']}"
    f"@{app.config['DB_HOST']}:{app.config['DB_PORT']}/{app.config['DB_NAME']}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)
migrate.init_app(app, db)


# --- Auth0 Setup ---
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


@app.route("/file-upload", methods=["POST"])
def upload_file():
    file = request.files['file']
    reader = PdfReader(file)

    page_texts = []
    
    # Extract text from each page
    for i in range(min(3, len(reader.pages))):
        txt = reader.pages[i].extract_text()
        if txt:
            txt = txt.strip()
            if txt:
                page_texts.append(txt)
    extracted_text = "\n\n".join(page_texts)
    if not extracted_text:
        return jsonify({"error": "No extractable text found in the PDF."}), 400
    try:
        summary = pdf_summary(extracted_text)
    except Exception as e:
        #print(f"Error during summarization: {e}")
        return jsonify({"error": "Failed to summarize the document."}), 500
    return jsonify({"text": summary})


# --- Context Processors ---
@app.context_processor
def inject_user_model():
    """Make User model available in templates"""
    return dict(User=User)


# --- Authentication Routes ---
@app.route("/login")
def login():
    return oauth.auth0.authorize_redirect(
        redirect_uri=url_for("callback", _external=True)
    )

@app.route("/callback", methods=["GET", "POST"])
def callback():
    token = oauth.auth0.authorize_access_token()
    session["user"] = token
    user_info = token["userinfo"]

    google_auth_id = user_info['sub']
    user_name = user_info['name']
    user_email = user_info['email']
    # print("PERSON NAME", session['user'])

    session["user_id"] = google_auth_id

    user = User.query.filter_by(google_auth_id=google_auth_id).first()
    if not user:
        new_user = User(
            google_auth_id=google_auth_id,
            user_name=user_name,
            user_email=user_email
        )
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
        "https://"
        + app.config["AUTH0_DOMAIN"]
        + "/v2/logout?"
        + urlencode(
            {
                "returnTo": url_for("index", _external=True),
                "client_id": app.config["AUTH0_CLIENT_ID"],
            },
            quote_via=quote_plus,
        )
    )

# --- Main Routes ---
@app.route("/")
def index():
    redirect_response = redirect_clean_params("index")
    if redirect_response:
        return redirect_response

    favorite_ids = set()
    if session.get("user_id"):
        rows = (
            db.session.query(Favorite_Conf.fav_conf_id)
            .filter_by(user_id=session["user_id"])
            .all()
        )
        favorite_ids = {r[0] for r in rows}

    record_count = count_indexes(app.config["MONGO_URI"], "kubishi-scholar", "conferences")

    query = request.args.get("query", "")
    location = request.args.get("location", "").strip().lower()
    ranking_source = request.args.get("ranking_source", "").strip().lower()
    ranking_score = request.args.get("ranking_score", "").strip().upper()

    ID_query = request.args.get("ID_query", "").upper()
    display_sate_span_first = request.args.get("date_span_first")
    display_sate_span_second = request.args.get("date_span_second")

    date_span_first = convert_date_format(request.args.get("date_span_first"))
    date_span_second = convert_date_format(request.args.get("date_span_second"))

    try:
        num_results = int(request.args.get("num_results", 10))
    except ValueError:
        num_results = 10

    advanced_open = any([date_span_first, date_span_second, location, ranking_source, ranking_score])

    # Use a single variable throughout
    articles = []

    if ID_query:
        uri = app.config["MONGO_URI"]
        #print("IDQUERY", ID_query)

        # Mongo fetch by id
        doc = fetch_by_id(
            uri,
            db_name="kubishi-scholar",
            collection_name="conferences",
            doc_id=ID_query
        )
        if doc:
            articles = [doc]

    elif query:
        try:
            # Vector search
            results = mongo_vec_query(
                app.config["MONGO_URI"],
                db_name="kubishi-scholar",
                coll_name="conferences",
                query_vec=embed(query),
                top_k=min(record_count, 50),
                index_name="vector_index",
                path="embedding"
            )
            # Step 3: Filter if any filters are set
            if date_span_first and date_span_second or location or ranking_score:
                try:
                    start_date = (
                        datetime.strptime(date_span_first, "%m-%d-%Y")
                        if display_sate_span_first else None
                    )
                    end_date = (
                        datetime.strptime(date_span_second, "%m-%d-%Y")
                        if display_sate_span_first else None
                    )

                    filtered_articles = [
                        a for a in results
                        if is_match(
                            a,
                            start_date=start_date,
                            end_date=end_date,
                            location=location,
                            ranking_source=ranking_source,
                            ranking_score=ranking_score,
                        )
                    ]
                    #print(f"Filtered {len(filtered_articles)} / {len(results)} articles after applying filters.")
                    articles = filtered_articles

                except Exception as e:
                    print(f"Filtering error: {e}")
                    articles = results or []
            else:
                articles = results or [] 
        except Exception as e:
            print(f"Vector search error: {e}")
            articles = []  # do not reference undefined names

    return render_template(
        "index.html",
        articles=articles[:num_results],                 # consistent
        favorite_ids=favorite_ids,
        query=query,
        ID_query=ID_query,
        num_results=num_results,
        date_span_first=display_sate_span_first,
        date_span_second=display_sate_span_second,
        session_user_name=session.get("user"),
        record_count=record_count,
        advanced_open=advanced_open,
        location=location,
        ranking_source=ranking_source,
        pretty=json.dumps(session.get("user"), indent=4) if session.get("user") else None
    )

@app.route("/favorite", methods=["POST"])
@login_required
def save_favorite():
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env.get("PORT", 3000)), debug=Config.FLASK_DEBUG)