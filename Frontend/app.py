from flask import Flask, flash, redirect, render_template, session, url_for, request ,jsonify
from pinecone import Pinecone # type: ignore
from openai import OpenAI
from datetime import datetime
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from authlib.integrations.flask_client import OAuth
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

from .config import Config # type: ignore
from .filters import is_match, redirect_clean_params, city_country_filter, to_gcal_datetime_filter, format_date, convert_date_format # type: ignore
from .forms import ConferenceForm # type: ignore

from flask_wtf import CSRFProtect
# --Flask App setup---
app = Flask(__name__)
app.config.from_object(Config)

csrf = CSRFProtect(app)

# ---SQL Database Setup---
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"mysql+pymysql://{app.config["DB_USER"]}:{app.config["DB_PASSWORD"]}@{app.config["DB_HOST"]}:{app.config["DB_PORT"]}/{app.config["DB_NAME"]}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

migrate = Migrate(app, db)

class User(db.Model):
    google_auth_id = db.Column(db.String(60), primary_key=True)
    user_name = db.Column(db.String(50))
    user_email = db.Column(db.String(50))

class Favorite_Conf(db.Model):
    user_id = db.Column(db.String(60), db.ForeignKey('user.google_auth_id'), primary_key=True)
    fav_conf_id = db.Column(db.String(50), primary_key=True)

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

# Pinecone Setup
pc = Pinecone(api_key=app.config["PINECONE_API_KEY"])
pinecone_index = pc.Index(host=app.config["PINECONE_HOST"])

# OpenAI Setup
openai_client = OpenAI(api_key=app.config["OPENAI_API_KEY"])

app.add_template_filter(city_country_filter, 'city_country')
app.add_template_filter(to_gcal_datetime_filter, 'to_gcal_datetime')
app.add_template_filter(format_date, 'format_date')

def get_embedding(text):
    """Generate an embedding vector for the given text."""
    if not text:
        raise ValueError("Input text for embedding cannot be empty.")
    try:
        response = openai_client.embeddings.create(
            input=text,
            model=app.config["EMBEDDING_MODEL"]
        )
        return response.data[0].embedding
    except Exception as e:
        raise RuntimeError(f"Error generating embedding: {e}")

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
    stats = pinecone_index.describe_index_stats()
    record_count = stats["total_vector_count"]
    return record_count

# MAIN PAGE
@app.route("/")
def index():
    
    redirect_response = redirect_clean_params("index")
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
        num_results = int(request.args.get("num_results", 3))
    except ValueError:
        num_results = 5

    advanced_open = any([
        date_span_first,
        date_span_second,
        date_span_first,
        date_span_second,
        location,
        ranking_source,
        ranking_score
    ])
    
    articles = []
    
    if ID_query:
        results = pinecone_index.query(
            id=ID_query, 
            top_k=1,
            include_metadata=True,
            include_values=False
        )

        articles = results.get("matches", [])

    elif query:
        try:
            # Step 1: Get embedding
            vector = get_embedding(query)

            # Step 2: Query Pinecone
            results = pinecone_index.query(
                vector=vector,
                top_k=50,
                include_metadata=True
            )

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

#edit page
@app.route('/edit_conf/<conf_id>', methods=['GET', 'POST'])
def edit_conference(conf_id):
    existing = pinecone_index.fetch(ids=[conf_id])
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
        conference_name=conf_meta.get("conference_name", ""),
        country=conf_meta.get("country", ""),
        city=conf_meta.get("city", ""),
        deadline=parse_date(conf_meta.get("deadline", "")),
        start=parse_date(conf_meta.get("start", "")),
        end=parse_date(conf_meta.get("end", "")),
        topic_list=conf_meta.get("topics", ""),
        conference_link=conf_meta.get("url", "")
    )


    if form.validate_on_submit():
        topic_vector = get_embedding(form.topic_list.data)

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
        pinecone_index.upsert(vectors=[updated_vector])
        flash("Conference updated successfully!", "success")
        return redirect(url_for("index"))
    
    return render_template("edit_conference.html", form=form, conf_id=conf_id)
  
# ENTER CONFERENCES PAGE
@app.route('/add_conf', methods=['GET', 'POST'])
def conference_adder():
    form = ConferenceForm()
    if form.validate_on_submit():
        topic_vector = get_embedding(form.topic_list.data)
        
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
            topic_vector = get_embedding(topic_list)

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
            pinecone_index.upsert(vectors=[vector])
            flash("Conference added successfully!", "success")
            return redirect(url_for("index"))  # redirect after POST

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
            app.logger.info(f"{u.user_name}, {u.user_email}, {u.google_auth_id}")


    else:
        app.logger.info("No user found with that email.")

    return render_template('friend_search.html', searched_user_info=searched_user_info, logged_in_user_id = logged_in_user_id, session_user_name=session.get('user'))
    # return jsonify([{"name": u.user_name, "email": u.user_email} for u in searched_user_info])


@app.route("/saved_conference")
def saved_conference():
    logged_in_user_id = session.get("user_id")
    favorited_conferences = db.session.query(Favorite_Conf).filter_by(user_id = logged_in_user_id).all()

    for fav in favorited_conferences:
        print(fav.fav_conf_id)
    
    return render_template('saved_conference.html', logged_in_user_id = logged_in_user_id, favorited_conferences=favorited_conferences, session_user_name=session.get('user'))

@app.route('/favorite', methods=['POST'])
def save_favorite():
    if 'user_id' not in session:
        return "Unauthorized", 401 
     
    data = request.get_json()
    conference_id = data.get('conference_id')
    user_id = session['user_id']

    if not conference_id:
        return "No conference_id provided", 400

    print(f"Saved conference ID: {conference_id}")

    new_user_conf_pair = Favorite_Conf(user_id=user_id, fav_conf_id=conference_id)
    db.session.add(new_user_conf_pair)
    db.session.commit()

    return jsonify({'id': conference_id}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env.get("PORT", 3000)), debug=Config.FLASK_DEBUG)