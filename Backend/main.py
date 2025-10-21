import sys
import pathlib
from typing import List, Dict, Any
from openai import OpenAI
import argparse
from datetime import datetime

import os
import pandas as pd  # <-- use pd
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

load_dotenv()

MODELS = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
}

thisdir = pathlib.Path(__file__).parent.resolve()
datapath = thisdir / 'csvs' / 'test_true.csv'
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

mongo_client = MongoClient(os.getenv("MONGO_URI"))
db = mongo_client["kubishi-scholar"]
collection = db["conferences"]

def get_embeddings(docs: List[str],
                   model: str = "text-embedding-3-small",
                   chunk_size: int = 100) -> List[List[float]]:
    if model not in MODELS:
        raise ValueError(f"Invalid model: {model}. Available: {list(MODELS.keys())}")
    embeddings: List[List[float]] = []
    for i in range(0, len(docs), chunk_size):
        chunk = docs[i:i+chunk_size]
        res = openai_client.embeddings.create(input=chunk, model=model)
        embeddings.extend([d.embedding for d in res.data])
    return embeddings

def build_text(row: pd.Series) -> str:
    # Compose a compact blurb from your columns
    title = str(row.get("Title") or "").strip()
    acro = str(row.get("Acronym") or "").strip()
    ranks = []
    for col in ["CORE2023","CORE2021","CORE2020","CORE2018","CORE2017","CORE2014","CORE2013","ERA2010"]:
        val = str(row.get(col) or "").strip()
        if val:
            ranks.append(f"{col}:{val}")
    h5i = str(row.get("h5_index") or "").strip()
    h5m = str(row.get("h5_median") or "").strip()
    header = f"{title} ({acro})" if acro else title
    tail_parts = []
    if ranks: tail_parts.append("; ".join(ranks))
    h5_tail = "; ".join([p for p in [f"h5_index:{h5i}" if h5i else "", f"h5_median:{h5m}" if h5m else ""] if p])
    if h5_tail: tail_parts.append(h5_tail)
    tail = " | ".join(tail_parts)
    return f"{header} — {tail}" if tail else header

def to_int_or_none(s: str):
    s = str(s or "").strip()
    try:
        return int(float(s)) if s else None
    except ValueError:
        return None

def build_docs(rows: pd.DataFrame, embeddings: List[List[float]], model: str) -> List[Dict[str, Any]]:
    dims_expected = MODELS[model]
    docs: List[Dict[str, Any]] = []
    for i, (idx, row) in enumerate(rows.iterrows()):
        emb = embeddings[i]
        if len(emb) != dims_expected:
            raise ValueError(f"Embedding length {len(emb)} != expected {dims_expected} for model {model}")

        base_id = (str(row.get("Acronym") or "").strip() or str(row.get("Title") or "").strip() or str(idx))
        doc = {
            "_id": base_id,
            "title": str(row.get("Title") or "").strip(),
            "acronym": str(row.get("Acronym") or "").strip(),
            "core": {
                "CORE2023": str(row.get("CORE2023") or "").strip(),
                "CORE2021": str(row.get("CORE2021") or "").strip(),
                "CORE2020": str(row.get("CORE2020") or "").strip(),
                "CORE2018": str(row.get("CORE2018") or "").strip(),
                "CORE2017": str(row.get("CORE2017") or "").strip(),
                "CORE2014": str(row.get("CORE2014") or "").strip(),
                "CORE2013": str(row.get("CORE2013") or "").strip(),
                "ERA2010":  str(row.get("ERA2010")  or "").strip(),
            },
            "h5_index": to_int_or_none(row.get("h5_index")),
            "h5_median": to_int_or_none(row.get("h5_median")),
            "text": row["text_for_embedding"],
            "embedding": emb,
            "model": model,
            "dims": len(emb),
            "updated_at": pd.Timestamp.utcnow().isoformat(),
        }
        docs.append(doc)
    return docs

def main():
    parser = argparse.ArgumentParser(description="Generate embeddings and store in MongoDB")
    parser.add_argument("--model", type=str, default="text-embedding-3-small", choices=list(MODELS.keys()))
    parser.add_argument("--chunk_size", type=int, default=100)
    parser.add_argument("--csv", type=str, default=str(datapath))
    args = parser.parse_args()

    # Load CSV as strings; replace NaN with ""
    df = pd.read_csv(args.csv, dtype=str).fillna("")
    required = {"Title","Acronym","CORE2023","CORE2021","CORE2020","CORE2018","CORE2017","CORE2014","CORE2013","ERA2010","h5_index","h5_median"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing columns: {sorted(missing)}")

    df["text_for_embedding"] = df.apply(build_text, axis=1)
    rows = df[df["text_for_embedding"].str.len() > 0].copy()
    texts = rows["text_for_embedding"].tolist()

    embeddings = get_embeddings(texts, model=args.model, chunk_size=args.chunk_size)
    docs = build_docs(rows, embeddings, model=args.model)

    # --- simple insert (will error if _id exists) ---
    # collection.insert_many(docs, ordered=False)

    # --- recommended: upsert to avoid duplicates ---
    ops = [UpdateOne({"_id": d["_id"]}, {"$set": d}, upsert=True) for d in docs]
    if ops:
        collection.bulk_write(ops, ordered=False)

    print(f"Upserted {len(docs)} documents into MongoDB collection.")

if __name__ == "__main__":
    main()