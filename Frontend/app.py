from flask import Flask, flash, redirect, render_template, session, url_for, request
from pinecone import Pinecone # type: ignore
from openai import OpenAI
from datetime import datetime
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from authlib.integrations.flask_client import OAuth
from flask_sqlalchemy import SQLAlchemy

from .config import Config # type: ignore
from .filters import is_match, redirect_clean_params, city_country_filter, to_gcal_datetime_filter, format_date, convert_date_format # type: ignore

# --Flask App setup---
app = Flask(__name__)
app.config.from_object(Config)

# ---SQL Database Setup---
# app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://myapp_user:Sebastian1@localhost/myapp_db'
# app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# db = SQLAlchemy(app)

# Auth0 setup
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
    response = openai_client.embeddings.create(
        input=text,
        model=app.config["EMBEDDING_MODEL"]
    )
    return response.data[0].embedding

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
    sub = "google-oauth2|1234567890"
    
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
    # GET existing data from Pinecone
    existing = pinecone_index.fetch(ids=[conf_id])

    if not existing.vectors:
        return f"Conference ID {conf_id} not found", 404

    conf_meta = existing.vectors[conf_id].metadata
    if request.method == 'POST':
        conference_ID = request.form.get("conference_ID", "")
        conference_name = request.form.get("conference_name", "")
        country = request.form.get("country", "")
        city = request.form.get("city", "")
        deadline = request.form.get("deadline", "")
        start_date = request.form.get("start_date", "")
        end_date = request.form.get("end_date", "")
        topic_list = request.form.get("topic_list", "")
        conference_link = request.form.get("conference_link", "")

        # Create new embedding
        topic_vector = get_embedding(topic_list)

        # Update Pinecone
        updated_vector = {
            "id": conf_id,
            "values": topic_vector,
            "metadata": {
                "conference_name": conference_name,
                "country": country,
                "city": city,
                "deadline": deadline,
                "start_date": start_date,
                "end_date": end_date,
                "topics": topic_list,
                "url": conference_link,
                "contributer": session['user']['userinfo']['sub'],
            }
        }
        pinecone_index.upsert(vectors=[updated_vector])
        flash("Conference updated successfully!", "success")
        return redirect(url_for('index'))  # Change 'index' to your main search route

    return render_template(
        "edit_conference.html",
        conf_id=conf_id,
        conf_meta=conf_meta
    )
    
# ENTER CONFERENCES PAGE
@app.route('/add_conf', methods=['GET', 'POST'])
def conference_adder():
    conference_id = ""

    if request.method == 'POST':
        conference_id = request.form.get("conference_id", "").strip()
        conference_name = request.form.get("conference_name", "").strip()
        country = request.form.get("country", "").strip()
        city = request.form.get("city", "").strip()
        deadline = request.form.get("deadline", "").strip()
        start_date = request.form.get("start_date", "").strip()
        end_date = request.form.get("end_date", "").strip()
        topic_list = request.form.get("topic_list", "").strip()
        conference_link = request.form.get("conference_link", "").strip()

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
                    "start_date": start_date,
                    "end_date": end_date,
                    "topics": topic_list,
                    "url": conference_link,
                    "contributer": session['user']['userinfo']['sub'],
                }
            }

            pinecone_index.upsert(vectors=[vector])
            flash("Conference added successfully!", "success")
            return redirect(url_for("index"))  # redirect after POST

    return render_template("add_conference.html", conference_id=conference_id)

    
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env.get("PORT", 3000)), debug=Config.FLASK_DEBUG)