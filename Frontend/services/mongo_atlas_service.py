from flask import current_app
from pymongo import MongoClient
from .openai_service import embed
from collections import defaultdict
from datetime import datetime
from typing import Optional, List, Dict, Any
def count_indexes(uri, db_name, collection_name):
    """
    Connects to MongoDB Atlas and returns the number of indexes
    in the specified collection.
    """
    try:
        client = MongoClient(uri)
        db = client[db_name]
        collection = db[collection_name]
        
        
        doc_count = collection.count_documents({})
        return doc_count
    except Exception as e:
        print("Error:", e)
        return None
    finally:
        client.close()

def mongo_vec_query(uri, db_name, coll_name, query_vec, top_k=10,
                           index_name="vector_index", path="embedding"):
    """
    Strict Atlas Vector Search only. No fallback. Returns docs with score.
    """
    print(index_name, "INDEX_NAME")
    print(path, "PATH")
    print(top_k, "TOP_K")
    client = MongoClient(uri)
    try:
        
        pipeline = [
            {
                "$vectorSearch": {
                    "index": index_name,
                    "path": path,
                    "queryVector": query_vec,
                    "numCandidates": 100,
                    "limit": top_k
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "acronym": 1,
                    "city": 1,
                    "core": 1,
                    "country": 1,
                    "deadline": 1,
                    "end": 1,
                    "h5_index": 1,
                    "h5_median": 1,
                    "notification": 1,
                    "start": 1,
                    "title": 1,
                    "topics": 1,
                    "score": {"$meta": "vectorSearchScore"},
                    "updated_at": 1,
                    "url": 1
                }
            }
        ]
        results = list(client[db_name][coll_name].aggregate(pipeline))
        print(f"[vec] hits={len(results)}")
        return results
    finally:
        client.close()

def mongo_lex_query(uri, db_name, coll_name, query, top_k=10, index_name="default", fields=None):
    if not (query and query.strip()):
        return []
    fields = fields or ["title","acronym","topics","city","country","core.CORE2023","core.CORE2021","core.CORE2020"]
    try:
        with MongoClient(uri) as c:
            coll = c[db_name][coll_name]
            pipeline = [
                {"$search": {
                    "index": index_name,
                    "compound": {
                            "should": [
                                { "text": {
                                    "path": "title",
                                    "query": query,
                                    "score": { "boost": { "value": 3 } }
                                }},
                                { "text": {
                                    "path": ["acronym", "topics", "city", "country"],
                                    "query": query
                                }},
                                # optionally also search your `fields` list if it's distinct:
                                # { "text": { "path": fields, "query": query } }
                            ],
                            "minimumShouldMatch": 1
                        }
                        # note: no second top-level operator here
                    }
                },
                {"$limit": max(int(top_k), 1)},
                {"$project": {
                    "_id": 1, "title": 1, "acronym": 1, "topics": 1,
                    "city": 1, "country": 1, "deadline": 1, "start": 1, "end": 1,
                    "h5_index": 1, "h5_median": 1, "notification": 1, "url": 1, "core": 1,
                    "updated_at": 1, "score": {"$meta": "searchScore"}
                }}
            ]
            return list(coll.aggregate(pipeline))

    except Exception as e:
        print("❌ Error during lexical query", e)
        return []

def fetch_by_id(uri, db_name, collection_name, doc_id):
    """
    Fetch a single MongoDB document by its string _id.
    """
    client = MongoClient(uri)
    try:
        coll = client[db_name][collection_name]
        doc = coll.find_one({"_id": doc_id})
        if doc:
            print(f"✅ Found: {doc['_id']}")
        else:
            print(f"⚠️ No document found with _id={doc_id}")
        return doc
    except Exception as e:
        print("❌ Error fetching document:", e)
        return None
    finally:
        client.close()

def change_status(uri: str, db_name: str, coll_name: str, user_id: str, curr_status: str):
    client = MongoClient(uri)
    try:
        coll = client[db_name][coll_name]
        result = coll.update_one(
            {"_id": user_id},
            {"set": {"status": curr_status}},
            upsert=True
        )
        return result
    finally:
        client.close()

def mongo_doc_upsert(collection, doc):
    """Takes a MongoDB collection and upserts the given doc."""
    
    if "_id" not in doc:
        raise ValueError("Document must include an '_id' field.")
    collection.replace_one({"_id": doc["_id"]}, doc, upsert=True)
    

def _rrf_fuse(rankings: List[List[Dict[str, Any]]], k: int = 50, c: float = 60.0, weights: Optional[List[float]] = None) -> List[str]:
    """
    rankings: list of ranked lists; each inner list contains docs with '_id'.
    c: RRF constant (typical 30–120, higher = flatter).
    weights: per-list weights; len(weights) == len(rankings).
    returns: list of _id in fused rank order.
    """
    if weights is None:
        weights = [1.0] * len(rankings)

    scores = defaultdict(float)
    for lst_idx, ranked_list in enumerate(rankings):
        w = float(weights[lst_idx])
        for rank, doc in enumerate(ranked_list, start=1):
            _id = doc.get("_id")
            if _id is None:
                continue
            scores[_id] += w * (1.0 / (c + rank))

    fused = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:k]
    return [_id for _id, _ in fused]

def mongo_hybrid_search_rrf(
    query: str,
    top_k: int = 50,
    *,
    text_index_name: str = "default",
    text_fields: Optional[List[str]] = None,   # if None, your mongo_lex_query default kicks in
    vec_index_name: str = "vector_index",
    vec_path: str = "embedding",
    rrf_c: float = 60.0,
    text_weight: float = 1.0,
    vec_weight: float = 1.0,
    # optional client-side filters (fast and easy):
    city: Optional[str] = None,
    country: Optional[str] = None,
    start_dt: Optional[datetime] = None,   # inclusive
    end_dt: Optional[datetime] = None      # inclusive
) -> List[Dict[str, Any]]:
    """
    Hybrid = lexical + vector fused via RRF. Reuses your mongo_lex_query / mongo_vec_query / embed.
    Returns full docs in fused order (union of both lists).
    """
    if not (query and query.strip()):
        return []

    uri = current_app.config["MONGO_URI"]
    db_name = "kubishi-scholar"
    coll_name = "conferences"

    # 1) lexical
    lex_hits = mongo_lex_query(
        uri, db_name, coll_name,
        query=query,
        top_k=top_k,
        index_name=text_index_name,
        fields=text_fields
    )

    # 2) vector
    qvec = embed(query)
    vec_hits = mongo_vec_query(
        uri, db_name, coll_name,
        query_vec=qvec,
        top_k=top_k,
        index_name=vec_index_name,
        path=vec_path
    )
    # 3) fuse by RRF
    fused_ids = _rrf_fuse([lex_hits, vec_hits], k=top_k, c=rrf_c, weights=[text_weight, vec_weight])

    # 4) build id->doc map (prefer lexical doc fields, fall back to vector doc)
    by_id: Dict[str, Dict[str, Any]] = {}
    for d in lex_hits:
        _id = d.get("_id")
        if _id is not None:
            by_id[_id] = d
    for d in vec_hits:
        _id = d.get("_id")
        if _id is not None and _id not in by_id:
            by_id[_id] = d

    # 5) client-side filters (matches your current style)
    def _passes(doc: Dict[str, Any]) -> bool:
        if city and str(doc.get("city", "")).strip().lower() != city.strip().lower():
            return False
        if country and str(doc.get("country", "")).strip().lower() != country.strip().lower():
            return False
        if start_dt or end_dt:
            s = doc.get("start")
            if not s:
                return False
            # robust ISO "Z"
            if isinstance(s, str) and s.endswith("Z"):
                s = s[:-1] + "+00:00"
            try:
                dt = datetime.fromisoformat(s) if isinstance(s, str) else s
            except Exception:
                return False
            if start_dt and dt < start_dt:
                return False
            if end_dt and dt > end_dt:
                return False
        return True

    fused_docs = [by_id[_id] for _id in fused_ids if _id in by_id and _passes(by_id[_id])]
    return fused_docs
