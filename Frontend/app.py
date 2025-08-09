from flask import Flask, redirect, render_template, session, url_for, request
import os
from pinecone import Pinecone # type: ignore
from openai import OpenAI
from dotenv import find_dotenv, load_dotenv
from datetime import datetime
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from authlib.integrations.flask_client import OAuth

from flask_sqlalchemy import SQLAlchemy
from filters import is_match, redirect_clean_params # type: ignore


load_dotenv()

# --Pinecone Setup--
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")
pc = Pinecone(api_key=PINECONE_API_KEY)
PINECONE_HOST = os.getenv("PINECONE_HOST")
pinecone_index = pc.Index(host=PINECONE_HOST)

# --OpenAI API Setup---
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --Flask App setup---
app = Flask(__name__)



# ---SQL Database Setup---
# app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://myapp_user:Sebastian1@localhost/myapp_db'
# app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# db = SQLAlchemy(app)

# --Auth0 setup---
app.secret_key = env.get("APP_SECRET_KEY")
oauth = OAuth(app)

oauth.register(
    "auth0",
    client_id=env.get("AUTH0_CLIENT_ID"),
    client_secret=env.get("AUTH0_CLIENT_SECRET"),
    client_kwargs={
        "scope": "openid profile email",
    },
    server_metadata_url=f'https://{env.get("AUTH0_DOMAIN")}/.well-known/openid-configuration'
)


@app.route("/login")
def login():
    return oauth.auth0.authorize_redirect(
        redirect_uri=url_for("callback", _external=True)
    )

@app.route("/callback", methods=["GET", "POST"])
def callback():
    token = oauth.auth0.authorize_access_token()
    
    print("TONEKKKKKKKKN", token["id_token"])
    session["user"] = token
    sub = "google-oauth2|1234567890"
    
    return redirect("/")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(
        "https://" + env.get("AUTH0_DOMAIN")
        + "/v2/logout?"
        + urlencode(
            {
                "returnTo": url_for("index", _external=True),
                "client_id": env.get("AUTH0_CLIENT_ID"),
            },
            quote_via=quote_plus,
        )
    )

@app.template_filter('city_country')
def city_country_filter(value):
    city, country = value
    string = f"{city}, {country}"
    return string

@app.template_filter('to_gcal_datetime')
def to_gcal_datetime_filter(value):
    if not value:
        return ""
    try:
        # Parse the ISO string with Z (UTC)
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        # Format as YYYYMMDDTHHMMSSZ
        return dt.strftime("%Y%m%dT%H%M%SZ")
    except Exception:
        return value  # fallback: return original if parsing fails

@app.template_filter('format_date')
def format_date(value, format="%b %d, %Y"):
    """Format ISO 8601 date string to a readable format, e.g. Jun 25, 2025."""
    if not value:
        return ""
    try:
        # Strip Z if present, to parse as naive datetime
        if value.endswith("Z"):
            value = value[:-1]
        dt = datetime.fromisoformat(value)
        return dt.strftime(format)
    except Exception:
        return value 


def convert_date_format(date_str):
    '''Convert yyyy-mm-dd to mm-dd-yyyy'''
    return datetime.strptime(date_str, "%Y-%m-%d").strftime("%m-%d-%Y") if date_str else ""

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
            embedding_response = openai_client.embeddings.create(
                input=query,
                model="text-embedding-3-small"
            )
            vector = embedding_response.data[0].embedding

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

# ENTER CONFERENCES PAGE
@app.route('/add_conf')
def conference_adder():
    conference_id = request.args.get("conference_id", "")
    conference_name = request.args.get("conference_name", "")
    country = request.args.get("country", "")
    city = request.args.get("city", "")
    deadline = request.args.get("deadline", "")
    start_date = request.args.get("start_date", "")
    end_date = request.args.get("end_date", "")
    topic_list = request.args.get("topic_list", "")
    conference_link = request.args.get("conference_link", "")

    print(f"ID: {conference_id}")
    print(f"Name: {conference_name}")
    print(f"Country: {country}")
    print(f"City: {city}")
    print(f"Deadline: {deadline}")
    print(f"Start: {start_date}")
    print(f"End: {end_date}")

    if conference_id:

        embedding_response = openai_client.embeddings.create(
            input=topic_list,
            model="text-embedding-3-small"
        )
        topic_vector = embedding_response.data[0].embedding

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

        res = pinecone_index.upsert(vectors=[vector])
        print(f"Response: {res}")

    return render_template('add_conference.html',
                           conference_id=conference_id)
    
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env.get("PORT", 3000)), debug=True)