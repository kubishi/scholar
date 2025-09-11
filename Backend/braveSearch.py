from urllib.parse import urlparse
import os
from dotenv import load_dotenv
import requests
from datetime import datetime

load_dotenv()
client = os.getenv("BRAVE_API_KEY")

def brave_search_conference_website(conf_name, conf_acronym, count=10):
    url = "https://api.search.brave.com/res/v1/web/search"
    year = datetime.now().year
    query = f"Find me the {year} conference website for the {conf_name} ({conf_acronym})"
    
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": client
    }
    
    params = {
        "q": query,
        "count": count
    }

    response = requests.get(url, headers=headers, params=params)

    if response.status_code != 200:
        print("Error:", response.status_code, response.text)
        return None
    
    results = response.json()
    items = results.get("web", {}).get("results", [])

    # Domains you don’t want to return
    blacklist = [
        "wikicfp.com",
        "guide2research.com",
        "eventbrite.com",
        "medium.com",
        "twitter.com",
        "linkedin.com",
        "facebook.com",
        "youtube.com",
        "link.springer.com",
        "clocate.com"
    ]

    for item in items:
        candidate = item.get("url") or item.get("URL")
        if not candidate:
            continue
        host = urlparse(candidate).hostname or ""
        if not any(bad in host for bad in blacklist):
            return candidate  # return the first non-blacklisted site

    return None

print(brave_search_conference_website("Symposium on Intelligent and Evolutionary Systems", "IES"))