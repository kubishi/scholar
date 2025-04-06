from openai import OpenAI
import os
from dotenv import load_dotenv
import re
from datetime import datetime

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def search_conference_website(conf_name, conf_acronym):
    year = datetime.now().year
    completion = client.chat.completions.create(
        model="gpt-4o-mini-search-preview",
        messages=[{
            "role": "user",
            "content": f"Find me only the {year} current conference website for the {conf_name} ({conf_acronym})",
        }],
    )
    response_text = completion.choices[0].message.content
    if response_text:
        url_match = re.search(r'https?://[^\s)]+', response_text)
        if url_match:
            return(url_match.group(0))
    return None

print(search_conference_website("1st International Conference on Building Energy and Environment", "COBEE"))
