from openai import OpenAI
import os
from dotenv import load_dotenv
import re

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

CONFERENCE_NAME = "Architectural Support for Programming Languages and Operating Systems"
CONFERENCE_ACRONYM = "ASPLOS"

completion = client.chat.completions.create(
    model="gpt-4o-mini-search-preview",
    messages=[{
        "role": "user",
        "content": "Find me only the 2025 current conference website for the " + CONFERENCE_NAME + "(" + CONFERENCE_ACRONYM + ")",
    }],
)
response_text = completion.choices[0].message.content
print(response_text)
if response_text:
    url_match = re.search(r'https?://[^\s)]+', response_text)
    if url_match:
        print(url_match.group(0))