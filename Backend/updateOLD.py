import os
from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from services.mongo_users import upsert_user
from datetime import datetime, timezone
import time

from scraper import fetch_page_content, extract_conference_details
from braveSearch import brave_search_conference_website
from GPTsearchURL import search_conference_website
load_dotenv()

mongo_uri = os.getenv("MONGO_URI")

def update_conference_url(conference):
    conf_name = conference.get("title", "")
    conf_acronym = conference.get("acronym", "")
    print(f"Searching URL for: {conf_name} ({conf_acronym})")
    # Use GPT or BRAVE to find the conference website
    url = search_conference_website(conf_name, conf_acronym)
    if url:
        existing_url = (conference.get("url", ""))
        print(f"Existing URL: {existing_url}")
        print(f"Found URL: {url}")

        if existing_url and url and existing_url == url:
            print("Skipping: existing URL matches found URL. No insert/update performed.")
            return   
        
        # Fetch page content and extract details
        
        page_content = fetch_page_content(url)
        if page_content:
            details = extract_conference_details(page_content)
            print(f"Extracted details: {details}")
            try:      
                conf_id = conference.get("_id")
                # Update the conference document
                
                submission_doc = {
                "_id": conf_id,
                "title": details.get("title", ""),
                "country": details.get("country", ""),
                "city": details.get("city", ""),
                "deadline": details.get("deadline", None),
                "start": details.get("start", None),
                "end": details.get("end", None),
                "topics": details.get("topics", []),
                "url": url,
                "submitter_user_name": "Robot Updater",
                "submitter_user_email": "",
                "submitter_id": "robot-updater",
                "status": "waiting",
                "edit_type": "edit",
                "time_submitted_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
                }

                # Prepare updated document
                update_fields = {"url": url}
                update_fields.update(details)

                # Merge fields with existing document
                new_doc = dict(conference)
                new_doc.update(update_fields)
                
                upsert_user(
                mongo_uri,
                "kubishi-scholar",
                "user_submitted_conf",
                submission_doc
                )

            except Exception as e:
                print("Error updating conference document:", e)
        else:
            print("Failed to fetch page content.")
    else:
        print("No URL found.")

def main():
    # Connect to MongoDB
    mongo_client = MongoClient(mongo_uri, server_api=ServerApi('1'))
    db = mongo_client['kubishi-scholar']
    collection = db['conferences']

    oldest_cursor = (
    collection.find({"start": {"$ne": None, "$ne": ""}})
    .sort("start", 1)   # take the oldest first
    .limit(3)           # cap it to 3 at a time
    )
    time.sleep(3) # to avoid rate limiting
    for conf in oldest_cursor:
        try:
            update_conference_url(conf)
        except Exception as e:
            print("Error processing conference:", e)
    mongo_client.close()

if __name__ == "__main__":
    main()