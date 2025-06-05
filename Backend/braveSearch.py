from openai import OpenAI
import os
from dotenv import load_dotenv
import re
import requests
from datetime import datetime

load_dotenv()


client = os.getenv("BRAVE_API_KEY")

def brave_search_conference_website(conf_name, conf_acronym, count = 1):
    url = "https://api.search.brave.com/res/v1/web/search"
    year = datetime.now().year
    query = f"Find me the {year} conference website for the {conf_name} ({conf_acronym}"
    
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
    
    results =  response.json()


    return results["web"]["results"][0]["url"]


print(brave_search_conference_website("International Conference on Distributed Computing Systems", "ICDCS"))