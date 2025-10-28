from flask import current_app
from pymongo import MongoClient
from .openai_service import embed

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