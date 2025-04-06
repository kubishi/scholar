from openai import OpenAI
import os
from bs4 import BeautifulSoup
import requests
from dotenv import load_dotenv
import pandas as pd
import json
from searchURL import search_conference_website
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
def fetch_page_content(url):
    response = requests.get(url)
    soup = BeautifulSoup(response.text, "html.parser")
    for script_or_style in soup(["script", "style"]):
        script_or_style.extract()
    page_content = soup.get_text(separator="\n")
    page_content = "\n".join(
        line.strip() for line in page_content.splitlines() if line.strip()
    )
    #page_content = soup.prettify() #GETS MORE INFO BUT IS MUCH SLOWER
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
    data_frame = pd.DataFrame(columns=["conference","h5_index","core_rank","era_rank","qualis_rank","deadline","notification","start","end","location","name","topics"])
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
def save_to_csv(data, url):
    # Check if 'conference' key exists in the data dictionary
    if not data or "conference" not in data:
        print("Error: Missing 'conference' key in data.")
        return

    # Add the URL to the data dictionary
    data["url"] = url

    # Create a DataFrame from the data dictionary
    df = pd.DataFrame([data])
    try:
        # Try to read the existing CSV file
        existing_df = pd.read_csv('test.csv')
    except FileNotFoundError:
        # If the file doesn't exist, create a new one with necessary columns
        existing_df = pd.DataFrame(columns=[
            "conference", "url", "deadline", "notification", 
            "start", "end", "location", "topics"
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

scored_conferences = pd.read_csv("Conference_Scores.csv")
def main():
    for name, acronym in zip(scored_conferences["Title"], scored_conferences["Acronym"].fillna("")):
        print(name, acronym)
        CITE_URL = search_conference_website(name, acronym)
        if not CITE_URL:
            print(f"URL not found for {name}")
            continue
        page_content = fetch_page_content(CITE_URL)
        extracted_results = extract_conference_details(page_content)
        print(extracted_results)
        save_to_csv(extracted_results, CITE_URL)
if __name__ == '__main__':
    main()