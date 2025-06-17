from flask import Flask, render_template, request
import requests
import os
from pinecone import Pinecone
from openai import OpenAI
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()


PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")
pc = Pinecone(api_key=PINECONE_API_KEY)
pinecone_index = pc.Index(host="https://aca2-qjtvg2h.svc.aped-4627-b74a.pinecone.io")
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
app = Flask(__name__)

# Homepage - Route
client = OpenAI()

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


@app.route("/")
def index():
    query = request.args.get("query", "")
    try:
        num_results = int(request.args.get("num_results", 3))
    except ValueError:
        num_results = 3
    date_span_first = request.args.get("date_span_first")
    date_span_second = request.args.get("date_span_second")
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

    return render_template("index.html", articles=articles, query=query, num_results=num_results, date_span_first=date_span_first, date_span_second=date_span_second)


if __name__ == "__main__":
    app.run(debug=True, port = 8080)