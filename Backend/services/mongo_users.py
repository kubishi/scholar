# services/mongo_users.py
from typing import Optional, Dict, Any
from pymongo import MongoClient, ReturnDocument

def upsert_user(uri: str, db_name: str, coll_name: str, user_doc: Dict[str, Any]):
    if "_id" not in user_doc:
        raise ValueError("user_doc must include an '_id' field.")

    client = MongoClient(uri)
    try:
        coll = client[db_name][coll_name]
        update_fields = {k: v for k, v in user_doc.items() if k != "_id"}
        coll.update_one(
            {"_id": user_doc["_id"]},
            {"$set": update_fields},
            upsert=True
        )
        return coll.find_one({"_id": user_doc["_id"]})
    finally:
        client.close()


def add_favorite(uri: str, db_name: str, coll_name: str, user_id: str, conf_id: str):
    client = MongoClient(uri)
    try:
        coll = client[db_name][coll_name]
        result = coll.update_one(
            {"_id": user_id},
            {"$addToSet": {"favorites": conf_id}},
            upsert=True
        )
        return result
    finally:
        client.close()

def remove_favorite(uri: str, db_name: str, coll_name: str, user_id: str, conf_id: str):
    client = MongoClient(uri)
    coll = client[db_name][coll_name]
    return coll.find_one_and_update(
        {"_id": user_id},
        {"$pull": {"favorites": conf_id}},
        return_document=ReturnDocument.AFTER,
    )