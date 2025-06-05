from flask import Flask, render_template, request
import requests
import os
from pinecone import Pinecone
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")
pc = Pinecone(api_key=PINECONE_API_KEY)
pinecone_index = pc.Index(host="https://aca2-qjtvg2h.svc.aped-4627-b74a.pinecone.io")
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
app = Flask(__name__)

# Homepage - Route
client = OpenAI()

response = client.embeddings.create(
    input="New theory and technology in robotics and biomimetics \n Bio-inspired robots, e.g., climbing, creeping, and walking robots \n Smart sensors and actuators \n Robotic vision and image processing \n Soft robotics and liquid-metal robotics \n Multi-sensor data fusion and sensor networks \n Artificial intelligence in robotics \n Multi-robot systems, swarm robots, and collaborative robots \n Autonomous mobile robots and manipulators \n Medical robotics, biomedical and rehabilitation engineering \n Space robots, aerial robots, and underwater robots \n Robotics in intelligent manufacturing \n MEMS, NEMS, nano-technology, and micro/nano systems � \n Applications of robotics and biomimetics",
    model="text-embedding-3-small"
)

@app.route("/")
def index():
    query = request.args.get("query", "")
    num_results = int(request.args.get("num_results", 3))
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

            articles = results.get("matches", [])

        except Exception as e:
            print(f"Error: {e}")

    print(articles)

    return render_template("index.html", articles=articles, query=query, num_results=num_results)


if __name__ == "__main__":
    app.run(debug=True)