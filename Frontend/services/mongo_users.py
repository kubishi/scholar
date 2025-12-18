# services/mongo_users.py
from typing import Optional, Dict, Any
from pymongo import MongoClient, ReturnDocument

def upsert_user(uri: str, db_name: str, coll_name: str, user_doc: Dict[str, Any]):
    if "_id" not in user_doc:
        raise ValueError("user_doc must include an '_id' field.")

    client = MongoClient(uri)
    try:
        coll = client[db_name][coll_name]
        # _id must be added seperatley since _id is immutable in mongodb. 
        # So if it already exists in the db, it would cause problems
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


def update_profile(uri: str, db_name: str, coll_name: str, user_id: str, profile_data: Dict[str, Any]):
    """Update user profile fields in MongoDB under 'about_me' dictionary"""
    client = MongoClient(uri)
    try:
        coll = client[db_name][coll_name]
        cleaned_data = {}
        for k, v in profile_data.items():
            if isinstance(v, str):
                if v.strip():
                    cleaned_data[k] = v.strip()
            elif v is not None:
                cleaned_data[k] = v

        result = coll.update_one(
            {"_id": user_id},
            {"$set": {"about_me": cleaned_data}},
            upsert=True
        )
        return result
    finally:
        client.close()
    