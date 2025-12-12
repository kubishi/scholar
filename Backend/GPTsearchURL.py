from openai import OpenAI
import os
from dotenv import load_dotenv
import re
from datetime import datetime
from typing import Optional

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def strip_tracking(url: str) -> str:
    TRACKING_RE = re.compile(r"([?&])(utm_[^=&]+|gclid|fbclid|mc_cid|mc_eid|igshid)=[^&#]*")
    if not url:
        return url
    new = url
    while True:
        cleaned = TRACKING_RE.sub(lambda m: "&" if m.group(1) == "&" else "?", new)
        cleaned = re.sub(r"[?&]$", "", cleaned)
        if cleaned == new:
            break
        new = cleaned
    return new

def search_conference_website(conf_name: str, conf_acronym: str) -> Optional[str]:
    """
    Use gpt-4o-mini-search-preview to find the most likely URL for a given conference this year.
    """
    year = datetime.now().year
    completion = client.chat.completions.create(
        model="gpt-4o-mini-search-preview",
        web_search_options={
        "search_context_size": 'low',
        },
        messages = [
        {
        "role": "user",
        "content": (
            f"Find the official {year} website for the academic conference.\n\n"
            f"Name: {conf_name}\n"
            f"Acronym: {conf_acronym}\n\n"
            "Rules:\n"
            "- Return ONLY the canonical homepage URL.\n"
            "- Prefer official conference domains (e.g., .org, .edu, .ac.uk, official subdomains).\n"
            "- Avoid third-party aggregators (WikiCFP, ResearchGate, AllConferences).\n"
            "- Remove all tracking parameters (e.g., ?utm_source).\n"
            "- If multiple years exist, choose the one for the current year.\n"
            "- If unsure, choose the most credible official site.\n"
            "Output ONLY the URL with no explanation."
            )
        }
    ]

    )
    response_text = completion.choices[0].message.content
    
    # Get token usage
    #token_usage = completion.usage
    #print("Token usage:", token_usage)
    
    if response_text:
        # Extract first URL
        url_match = re.search(r'https?://[^\s)]+', response_text)
        if url_match:
            clean_url = strip_tracking(url_match.group(0))
            return clean_url
    return None

#print(search_conference_website("ACM Symposium on Eye Tracking Research & Applications", "ETRA"))