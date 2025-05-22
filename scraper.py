from openai import OpenAI
import os
from bs4 import BeautifulSoup
import requests
from dotenv import load_dotenv
import pandas as pd
import json
from searchURL import search_conference_website
from braveSearch import brave_search_conference_website
import time
load_dotenv()

MODELS = {''
    "text-embedding-3-small": {
        "size": 1536, 
    },
    "text-embedding-3-large": {
        "size": 3072,
    }
}
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# Takes website and creates a parse tree from the HTML code
def fetch_page_content(url, max_retries=3, delay=2):
    headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
                "Referer": "https://research.kubishi.com"
            }
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            for script_or_style in soup(["script", "style"]):
                script_or_style.extract()
            page_content = soup.get_text(separator="\n")
            page_content = "\n".join(
                line.strip() for line in page_content.splitlines() if line.strip()
            )
            return page_content
        except (requests.RequestException, Exception) as e:
            print(f"Attempt {attempt + 1} failed for {url}: {e}")
            time.sleep(delay)
    print(f"Skipping {url} after {max_retries} failed attempts.")
    return None

# Creates blank data to "reset" .csv files for new data
def reset_csv():
    data_frame = pd.DataFrame(columns=["conference","h5_index","core_rank","era_rank","qualis_rank","deadline","notification","start","end","location","name","topics"])
    data_frame.to_csv('test.csv', index=False) 
    return data_frame

# Uses OpenAI to find specific info from the webpage and prompts AI to analyze data
def extract_conference_details(page_content: str):
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
                        "description": "No years or dates in this area should be included. The acronym/abbreviation of the conference. Example: International Conference on Ad Hoc Networks and Wireless = ADHOC-NOW or International Conference on Cooperative Information Systems = CoopIS."
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
    try:
        # Safely access tool_calls
        if completion.choices[0].message.tool_calls:
            structured_data = json.loads(completion.choices[0].message.tool_calls[0].function.arguments)
            return structured_data
        else:
            print("No tool calls were made or the tool failed to respond.")
            return {}
    except (IndexError, TypeError, json.JSONDecodeError) as e:
        print(f"Error extracting conference details: {e}")
        return {}

# Writes the DataFrame to a CSV file
def save_openai_to_csv(data, url, CORE2023,CORE2021,CORE2020,CORE2018,CORE2017,CORE2014,CORE2013,ERA2010,h5_index,h5_median):
    # Check if 'conference' key exists in the data dictionary
    if not data or "conference" not in data:
        print("Error: Missing 'conference' key in data.")
        return
    
# CORE2023,CORE2021,CORE2020,CORE2018,CORE2017,CORE2014,CORE2013,ERA2010,h5_index,h5_median

    # Add the URL to the data dictionary
    data["url"] = url
    data["CORE2023"] = CORE2023
    data["CORE2021"] = CORE2021
    data["CORE2020"] = CORE2020
    data["CORE2018"] = CORE2018
    data["CORE2017"] = CORE2017
    data["CORE2014"] = CORE2014
    data["CORE2013"] = CORE2013
    data["ERA2010"] = ERA2010
    data["h5_index"] = h5_index
    data["h5_median"] = h5_median

    # Create a DataFrame from the data dictionary
    df = pd.DataFrame([data])
    try:
        # Try to read the existing CSV file
        existing_df = pd.read_csv('test.csv')
    except FileNotFoundError:
        # If the file doesn't exist, create a new one with necessary columns
        existing_df = pd.DataFrame(columns=[
                    "conference",
                    "name",
                    "deadline",
                    "notification",
                    "start",
                    "end",
                    "location",
                    "topics"
        ])

    # Check for duplicate entry based on the 'conference' field
    if data["conference"] in existing_df["conference"].values:
        # Update the existing row instead of appending
        existing_df.loc[existing_df["conference"] == data["conference"], "url"] = url
        print("Updated existing conference entry:", data["conference"])
    else:
        # Append new data to the existing DataFrame
        existing_df = pd.concat([existing_df, df], ignore_index=True)
        print("Added new conference entry:", data["conference"])

    # Save the updated DataFrame back to the CSV file
    existing_df.to_csv("test.csv", index=False)
    print("Data saved successfully.")






scored_conferences = pd.read_csv("100conference.csv")
def main():
    for name, acronym, core_2023, core_2021, core_2020, core_2018, cor_2017, core_2014, core_2013, era_2010, h5_index, h5_median in zip(
        scored_conferences["Title"], 
        scored_conferences["Acronym"].fillna(""), 
        scored_conferences["CORE2023"].fillna(""),
        scored_conferences["CORE2021"].fillna(""),
        scored_conferences["CORE2020"].fillna(""),
        scored_conferences["CORE2018"].fillna(""),
        scored_conferences["CORE2017"].fillna(""),
        scored_conferences["CORE2014"].fillna(""),
        scored_conferences["CORE2013"].fillna(""),
        scored_conferences["ERA2010"].fillna(""),
        scored_conferences["h5_index"].fillna(""),
        scored_conferences["h5_median"].fillna(""),
    ):
        time.sleep(2)
        print(name, acronym)
        CITE_URL = brave_search_conference_website(name, acronym)
        print(CITE_URL)
        if not CITE_URL:
            print(f"URL not found for {name}")
            continue
        page_content = fetch_page_content(CITE_URL)
        if page_content:
            extracted_results = extract_conference_details(page_content)
            print(extracted_results)
            save_openai_to_csv(extracted_results, CITE_URL, core_2023, core_2021, core_2020, core_2018, cor_2017, core_2014, core_2013, era_2010, h5_index, h5_median)


if __name__ == '__main__':
    main()