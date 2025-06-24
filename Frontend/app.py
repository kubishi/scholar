from flask import Flask, redirect, render_template, session, url_for, request
import requests
import os
from pinecone import Pinecone
from openai import OpenAI
from dotenv import find_dotenv, load_dotenv
from datetime import datetime
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from authlib.integrations.flask_client import OAuth


load_dotenv()


PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")
pc = Pinecone(api_key=PINECONE_API_KEY)
pinecone_index = pc.Index(host="https://aca2-qjtvg2h.svc.aped-4627-b74a.pinecone.io")
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
app = Flask(__name__)

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

# Homepage - Route
client = OpenAI()


@app.route("/login")
def login():
    return oauth.auth0.authorize_redirect(
        redirect_uri=url_for("callback", _external=True)
    )

@app.route("/callback", methods=["GET", "POST"])
def callback():
    token = oauth.auth0.authorize_access_token()
    session["user"] = token
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

@app.route("/")
def index():
    query = request.args.get("query", "")
    try:
        num_results = int(request.args.get("num_results", 3))
    except ValueError:
        num_results = 5
    
    date_span_first = convert_date_format(request.args.get("date_span_first"))
    date_span_second = convert_date_format(request.args.get("date_span_second"))
    articles = []

    if query:
       
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
                top_k=num_results,
                include_metadata=True
            )

            print(results)
            

            all_articles = results.get("matches", [])

            # Step 3: Filter by start date within X months
            if date_span_first and date_span_second:
                try:
                    def is_within_span(article):
                        try:
                            start_date = datetime.strptime(date_span_first, "%m-%d-%Y")
                            end_date = datetime.strptime(date_span_second, "%m-%d-%Y")
                            article_start = datetime.fromisoformat(article["metadata"]["start"].rstrip("Z"))
                            
                            return start_date <= article_start <= end_date
                        except Exception:
                            return False

                    articles = list(filter(is_within_span, all_articles))
                except:
                    articles = all_articles
            else:
                articles = all_articles

        except Exception as e:
            print(f"Error: {e}")

    return render_template("index.html", 
                           articles=articles,
                           query=query,
                           num_results=num_results,
                           date_span_first=date_span_first,
                           date_span_second=date_span_second,
                           session=session.get('user'),
                           pretty=json.dumps(session.get('user'), indent=4) if session.get('user') else None)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=env.get("PORT", 3000), debug=True)