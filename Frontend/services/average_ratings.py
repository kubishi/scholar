from pymongo.mongo_client import MongoClient
from flask import current_app
from collections import defaultdict




def ratings_to_average(uri):
    client = MongoClient(uri)
    db = client["kubishi-scholar"]
    ratings_coll = db["user_conf_rating"]

    ratings = list(ratings_coll.find({}))

    
    ratings_per_conference = defaultdict(list)
    for rating in ratings: 
        sum_rating = sum(int(rank_number) for rank_number in rating["user_ratings"].values())
        average_rating = sum_rating / len(rating["user_ratings"])
        ratings_per_conference[rating["conference_id"]].append(average_rating)
  
    conf_coll = db["conferences"]
    for conference_id, average_rating in ratings_per_conference.items():
        conf_avg = sum(average_rating) / len(average_rating)
        conf_coll.update_one(
            { "_id" : conference_id },
            { "$set" : { "average_rating": conf_avg } }
        )
    
    client.close()



