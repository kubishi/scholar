from openai import OpenAI
import os
from dotenv import load_dotenv
import re
import pandas as pd

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

scored_confrences = pd.read_csv("Conference_Scores.csv")




def search_confrence_website(conf_name, conf_acronym):

    completion = client.chat.completions.create(
        model="gpt-4o-mini-search-preview",
        messages=[{
            "role": "user",
            "content": "Find me only the 2025 current conference website for the " + conf_name + "(" + conf_acronym + ")",
        }],
    )
    response_text = completion.choices[0].message.content
    #print(response_text)
    if response_text:
        url_match = re.search(r'https?://[^\s)]+', response_text)
        if url_match:
            print(url_match.group(0))

def conf_iteration():
    for index, row in scored_confrences.iterrows():
        conf_name = row["Title"]
        conf_acronym = row["Acronym"]
        search_confrence_website(conf_name, conf_acronym)
        # CONFERENCE_NAME = "Architectural Support for Programming Languages and Operating Systems"
        # CONFERENCE_ACRONYM = "ASPLOS"

print(conf_iteration())