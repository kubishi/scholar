import sys
import pandas
import pathlib
from typing import List
from openai import OpenAI
import argparse
from datetime import datetime

import os
from pinecone import Pinecone, ServerlessSpec
from typing import List, Dict
from dotenv import load_dotenv

load_dotenv()

MODELS = {
    "text-embedding-3-small": {
        "size": 1536, 
    },
    "text-embedding-3-large": {
        "size": 3072,
    }
}
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")

thisdir = pathlib.Path(__file__).parent.resolve()
datapath = thisdir / 'data.csv'
pc = Pinecone(api_key=PINECONE_API_KEY)
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

CORE_RANKS = ["A*", "A", "B", "C"]

def get_embeddings(docs: List[str],
                   model="text-embedding-3-small",
                   chunk_size=100) -> List[List[float]]:
    if model not in MODELS:
        raise ValueError(f"Invalid model: {model}. Available models: {list(MODELS.keys())}")
    doc_chunks = [docs[i:i+chunk_size] for i in range(0, len(docs), chunk_size)]
    embeddings = []
    for doc_chunk in doc_chunks:
        res = openai_client.embeddings.create(input=doc_chunk, model=model)
        embeddings.extend([d.embedding for d in res.data])

    return embeddings

class ConferenceDB:
    def __init__(self, model_name="text-embedding-3-small"):
        """Initialize the Pinecone index."""
        self.dimension = MODELS[model_name]["size"]
        
        if PINECONE_INDEX_NAME not in pc.list_indexes().names():
            pc.create_index(
                name=PINECONE_INDEX_NAME,
                dimension=self.dimension,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-west-2")  # Adjust region if necessary
            )

        self.index = pc.Index(PINECONE_INDEX_NAME)
    
    def insert(self, conferences: List[Dict]):
        """Insert conferences into the Pinecone index."""
        vectors = []
        for conf in conferences:
            unique_id = conf["conference"]
            vector = {
                "id": unique_id,  # Use HTML ID as the unique identifier
                "values": conf["embedding"],
                "metadata": {
                    key: value
                    for key, value in conf.items()
                    if key not in ["embedding"]
                }
            }
            vectors.append(vector)
        
        res = self.index.upsert(vectors=vectors)
        print(f"Response: {res}")
        
    
    def search_by_embedding(self,
                            query_vector: List[float],
                            filter: Dict = None,
                            limit: int = 5) -> List[Dict]:
        """Search the Pinecone index using a vector embedding."""
        results = self.index.query(
            vector=query_vector,
            top_k=limit,
            include_metadata=True,
            filter=filter
        )
        
        return [
            {
                **{
                    key: value
                    for key, value in match["metadata"].items()
                },
                "query_score": match["score"]
            }
            for match in results.get("matches", [])
        ]
    
    def clear_all(self):
        """Delete all records in the Pinecone index."""
        try:
            self.index.delete(delete_all=True)
        except Exception as e:
            print(f"Error deleting records: {e}")

def load_data():
    return pandas.read_csv(datapath)

def upload_data():
    data = load_data()
    data = data.astype(object)

    # change nan to None
    data = data.where(pandas.notnull(data), None)
    # change numpy nan to None
    data = data.where(data.notnull(), None)
    # change all columns to object type

    # get rows as list of dictionaries
    conferences = data.to_dict(orient='records')
    
    # remove None values from each record
    conferences = [{k: v for k, v in conf.items() if v is not None} for conf in conferences]

    topics = [conf["topics"] for conf in conferences]
    embeddings = get_embeddings(topics)
    for conf, emb in zip(conferences, embeddings):
        conf["embedding"] = emb

    # add deadline month and day fields
    for conf in conferences:
        deadline = datetime.strptime(conf["deadline"], "%d-%b")
        conf["deadline_month"] = deadline.month
        conf["deadline_day"] = deadline.day

    db = ConferenceDB()
    db.insert(conferences)

def get_parser():
    parser = argparse.ArgumentParser(description="Upload conference data to Pinecone.")
    subparsers = parser.add_subparsers(dest="command")
    upload_parser = subparsers.add_parser("upload", help="Upload conference data to Pinecone.")

    query_parser = subparsers.add_parser("query", help="Query the Pinecone index.")
    query_parser.add_argument("query", type=str, help="Query string.")
    query_parser.add_argument("--limit", type=int, default=20, help="Number of results to return.")
    query_parser.add_argument("--min-core-rank", choices=CORE_RANKS, help="Minimum core rank to filter results.")
    query_parser.add_argument("--upcoming", action="store_true", help="Filter upcoming deadlines.")
    query_parser.add_argument("--sort-by", type=str, help="Sort results by a column.", default="query_score")
    return parser

def main():
    parser = get_parser()
    args = parser.parse_args()

    if not hasattr(args, "command"):
        sys.argv.append("--help")
        args = parser.parse_args()
        return

    if args.command == "upload":
        upload_data()
    elif args.command == "query":
        db = ConferenceDB()
        query_vector = get_embeddings([args.query])[0]
        filter = {}
        if args.min_core_rank:
            min_rank_idx = CORE_RANKS.index(args.min_core_rank)
            allowed_ranks = CORE_RANKS[:min_rank_idx+1]
            filter["core_rank"] = {"$in": allowed_ranks}
        if args.upcoming:
            today = datetime.today()
            filter["deadline_month"] = {"$gte": today.month}
            filter["deadline_day"] = {"$gte": today.day}

        results = db.search_by_embedding(
            query_vector,
            filter=filter,
            limit=args.limit
        )
        # rows = []
        # for i, res in enumerate(results):
        #     rows.append([res.get(col, "") for col in cols])
        df = pandas.DataFrame.from_records(results)
        # sort by deadline (first parse  10-Feb style dates)
        df["deadline"] = df["deadline"].apply(lambda x: datetime.strptime(x, "%d-%b") if x else None)
        
        df["rank_index"] = df["core_rank"].apply(lambda x: CORE_RANKS.index(x) if x in CORE_RANKS else len(CORE_RANKS))
        args.sort_by = "rank_index" if args.sort_by == "core_rank" else args.sort_by # sort by rank index if sorting by core rank
        ascending = args.sort_by in ["deadline", "deadline_month", "deadline_day"]
        df = df.sort_values(by=[args.sort_by], ascending=ascending)


        df["deadline"] = df["deadline"].apply(lambda x: x.strftime("%d-%b") if x else None)
        df["query_score"] = df["query_score"].apply(lambda x: round(x, 3))

        cols = ["conference", "name", "core_rank", "deadline", "query_score"]
        print(df[cols].to_string(index=False))
    else:
        sys.argv.append("--help")
        args = parser.parse_args()
        return

if __name__ == '__main__':
    main()