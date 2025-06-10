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



@app.route("/")
def index():
    query = request.args.get("query", "")
    num_results = int(request.args.get("num_results", 3))
    month_span = request.args.get("month_span")
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

            all_articles = results.get("matches", [])

            # Step 3: Filter by start date within X months
            if month_span:
                try:
                    month_span = int(month_span)
                    cutoff_date = datetime.now() + timedelta(days=30 * month_span)

                    def is_within_span(article):
                        try:
                            start_date = datetime.fromisoformat(article["metadata"]["start"])
                            return start_date <= cutoff_date
                        except:
                            return False

                    articles = list(filter(is_within_span, all_articles))
                except:
                    articles = all_articles
            else:
                articles = all_articles

        except Exception as e:
            print(f"Error: {e}")

    return render_template("index.html", articles=articles, query=query, num_results=num_results, month_span=month_span)


if __name__ == "__main__":
    app.run(debug=True, port = 8080)