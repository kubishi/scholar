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
        

        # optional sanity print to avoid silent mismatches
        print(f"[vec] len(query_vec)={len(query_vec)} index={index_name} path={path} top_k={top_k}")

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
                    "title": 1,
                    "score": {"$meta": "vectorSearchScore"}
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


# if __name__ == "__main__":
#     print("Generating real embedding...")
#     query_vec = embed("algorithmic learning theory conference in Milan")
#     print("Running MongoDB vector search...")
#     hits = mongo_vec_query(query_vec)
#     print("Results:", hits)