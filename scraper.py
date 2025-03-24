from openai import OpenAI

import os
from bs4 import BeautifulSoup
import time
import datetime
import requests
from dotenv import load_dotenv
import pandas
import json


load_dotenv()

MODELS = {''
    "text-embedding-3-small": {
        "size": 1536, 
    },
    "text-embedding-3-large": {
        "size": 3072,
    }
}

CITE_URL = "https://sites.google.com/view/isaac2024/home"

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Takes website and creates a parse tree from the HTML code
def fetch_page_content(url):
    response = requests.get(url)
    soup = BeautifulSoup(response.text, "html.parser")
    page_content = soup.prettify()
    return page_content

# Specifically targeting different HTML tags
# title = soup.find("title").get_text(strip=True) if soup.find("title") else "No Title Found"
# headings = [h.get_text(strip=True) for h in soup.find_all(["h1", "h2", "h3"])]
# paragraphs = [p.get_text(strip=True) for p in soup.find_all("p")]
# list_items = [li.get_text(strip=True) for li in soup.find_all("li")]

# Combine extracted data
# page_content = f"Title: {title}\n\n"
# page_content += "Headings:\n" + "\n".join(headings) + "\n\n"
# page_content += "Paragraphs:\n" + "\n".join(paragraphs[:5]) + "\n\n"  # Limit paragraphs to avoid too much text
# page_content += "List Items:\n" + "\n".join(list_items[:10])  # Limit to first 10 list items

# Creates blank data to "reset" .csv files for new data
def reset_csv():
    data_frame = pandas.DataFrame(columns=["conference","h5_index","core_rank","era_rank","qualis_rank","deadline","notification","start","end","location","name","topics"])
    data_frame.to_csv('test.csv', index=False) 
    return data_frame

# Uses OpenAI to find specific info from the webpage and prompts AI to analyze data
def extract_conference_details(page_content):
    tools = [{
        "type": "function",
        "function": {
            "name": "get_info",
            "description": "Get the different pieces of information about the conference/event.",
            "parameters": {
                "type": "object",
                "properties": {
                    "conference": {
                        "type": "string",
                        "description": "The acronym/abbreviation of the conference. Example: International Conference on Ad Hoc Networks and Wireless = ADHOC-NOW or International Conference on Cooperative Information Systems = CoopIS."
                    },
                    "deadline": {
                        "type": "string",
                        "description": "The date when the application submission is due. Application due date."
                    },
                    "notification": {
                        "type": "string",
                        "description": "Notification of acceptance. The date when communication sent to an author or presenter informing them that their submitted paper or proposal has been accepted for presentation at the conference."
                    },
                    "start": {
                        "type": "string",
                        "description": "Date of welcome reception and/or first day of conference."
                    },
                    "end": {
                        "type": "string",
                        "description": "The date of the last day of the conference. All should be written in DD-MM-YYYY format."
                    },
                    "location": {
                        "type": "string",
                        "description": "The city, country where the conference is taking place. For example: Frankfurt, Germany (or) Los Angeles, USA (or) Algiers, Algeria."
                    },
                    "name": {
                        "type": "string",
                        "description": "The full, unabbreviated name for the conference of interest. For example: Algorithmic Aspects of Wireless Sensor Networks, Analysis and Simulation of Wireless and Mobile Systems, ACM International Conference on Hybrid Systems: Computation and Control."
                    },
                    "topics": {
                        "type": "string",
                        "description": "Top 10 Main Computer Science topics covered in the conference. Just list it out, no filler words. Just newline/enter in between each item."
                    },

                },
                "required": [
                    "conference",
                    "deadline",
                    "notification",
                    "start",
                    "end",
                    "location",
                    "name",
                    "topics"
                ],
                "additionalProperties": False
            },
            "strict": True
        }
    }]

    completion = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Extract relevant details from the provided text."},
            {"role": "user", "content": page_content}
        ],
        tools=tools
        
    )
    # .tool_calls is used when you are using a tool function. .content is just for plain text
    structured_data = completion.choices[0].message.tool_calls
    structured_data = json.loads(completion.choices[0].message.tool_calls[0].function.arguments)
    return structured_data




# Writes the DataFrame to a CSV file
# df.to_csv('test.csv', index=False) 
def save_to_csv(data):
    df = pandas.DataFrame([data])
    existing_df = pandas.read_csv('test.csv')
    df = pandas.concat([existing_df, df], ignore_index = True)
    df.to_csv("test.csv", index = False)


def main():
    page_content = fetch_page_content(CITE_URL)
    print(page_content)
    extracted_results = extract_conference_details(page_content)
    print(extracted_results)
    save_to_csv(extracted_results)
    

if __name__ == '__main__':
    main()