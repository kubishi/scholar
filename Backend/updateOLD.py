from openai import OpenAI
import os
from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from datetime import datetime, timezone, timedelta
import time

from scraper import fetch_page_content, extract_conference_details
from braveSearch import brave_search_conference_website
from GPTsearchURL import search_conference_website
from ..Frontend.services.db_services import db # type: ignore
from ..Frontend.models import User, Favorite_Conf, Submitted_Conferences # type: ignore
from ..Frontend.forms import ConferenceForm # type: ignore
load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
mongo_uri = os.getenv("MONGO_URI")

def remove_old_conference(conference, collection):
    """Remove a conference if it has already started."""
    try:
        start_str = conference.get("start")
        if not start_str:
            return False  # no start date to compare

        start_time = datetime.fromisoformat(start_str.replace("Z", "+00:00"))

        now = datetime.now(timezone.utc)
        three_years = timedelta(days=3 * 365)  # approx 3 years

        if now - start_time > three_years:
            result = collection.delete_one({"_id": conference["_id"]})
            if result.deleted_count > 0:
                print(f"Deleted past conference: {conference.get('title', '(no title)')} (start: {start_str})")
            return True
    except Exception as e:
        print(f"⚠️ Error while checking/removing conference {conference.get('_id')}: {e}")
    return False

def update_conference_url(conference, db):
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
            start_time = datetime.fromisoformat(details["start"].replace("Z", "+00:00"))
            one_years = timedelta(days=1 * 365)  # approx 3 years
            if datetime.now(timezone.utc) - start_time > one_years:
                print("⚠️ Skipping: Conference has already started or passed. No insert/update performed.")
                return
            try:      
                # Update the conference document
                # Connect to both collections
                form = ConferenceForm()
                if form.validate_on_submit():
                    conference_id = (details.get("acronym") or "").strip().upper()

                    new_submission = Submitted_Conferences(
                        conf_id=conference_id,
                        submitter_user_name="Automated Script",
                        submitter_id="system",
                        status='waiting',
                        edit_type='new',
                        conference_name=(details.get("title") or "").strip(),
                        country=(details.get("country") or "").strip(),
                        city=(details.get("city") or "").strip(),
                        deadline=details.get("deadline"),
                        start=details.get("start"),
                        end=details.get("end"),
                        topics=(details.get("topics") or "").strip(),
                        url=(details.get("url") or url).strip(),
                        time_submitted_at=datetime.now(timezone.utc).isoformat()
                    )
                    db.session.add(new_submission)
                    db.session.commit()
                
                print(f"Inserted updated record into 'conferences_updated' with _id: {conference_id}")
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
    .sort("start", 1)   # ascending order (oldest first)
    .limit(10)           # take the next one
    )
    time.sleep(3) # to avoid rate limiting
    for conf in oldest_cursor:
        try:
            update_conference_url(conf, db)
        except Exception as e:
            print("Error processing conference:", e)
    mongo_client.close()

if __name__ == "__main__":
    main()