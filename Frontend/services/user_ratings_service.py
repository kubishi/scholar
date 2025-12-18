from typing import Optional, Dict, Any
from pymongo import MongoClient, ReturnDocument

def upsert_rating(uri: str, db_name: str, coll_name: str, user_rating_doc: Dict[str, Any]):
    print("arrived in upsert_rating place", uri, db_name, coll_name, user_rating_doc)
    client = MongoClient(uri)
    try:
        coll = client[db_name][coll_name]
        update_fields = {k: v for k, v in user_rating_doc.items() if k != "_id"}

        coll.update_one(
            {"_id": user_rating_doc["_id"]},
            {"$set": update_fields},
            upsert=True
        )

        return coll.find_one({"_id": user_rating_doc["_id"]})
    finally:
        client.close()

