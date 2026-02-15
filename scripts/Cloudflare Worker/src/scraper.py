from js import fetch, Headers
from bs4 import BeautifulSoup
import json
from openai import OpenAI
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

# Workers use the 'env' object passed to the handler for secrets
# Note: Removed load_dotenv() as it is not supported

async def fetch_page_content(url: str, max_retries: int = 3) -> Optional[str]:
    headers = Headers.new()
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    headers.set("Referer", "https://research.kubishi.com")
    
    for attempt in range(max_retries):
        try:
            # Use Worker's native async fetch instead of requests
            response = await fetch(url, headers=headers)
            if response.status != 200:
                continue
                
            html_text = await response.text()
            soup = BeautifulSoup(html_text, "html.parser")
            
            for script_or_style in soup(["script", "style"]):
                script_or_style.extract()
                
            page_content = soup.get_text(separator="\n")
            return "\n".join(line.strip() for line in page_content.splitlines() if line.strip())
        except Exception as e:
            print(f"Attempt {attempt + 1} failed for {url}: {e}")
            # Note: time.sleep() is not supported; Workers use async/await for flow control
    return None

# Uses OpenAI to find specific info from the webpage and prompts AI to analyze data
async def extract_conference_details(page_content: str, api_key: str):    
    openai_client = OpenAI(api_key=api_key)
    tools = [{
        "type": "function",
        "function": {
            "name": "get_info",
            "description": "Get the different pieces of information about the conference/event.",
            "parameters": {
                "type": "object",
                "properties": {
                    "Acronym": {
                        "type": "string",
                        "description": "No years or dates in this area should be included. The acronym/abbreviation of the conference. Example: International Conference on Ad Hoc Networks and Wireless = ADHOC-NOW or International Conference on Cooperative Information Systems = CoopIS."
                    },
                    "deadline": {
                        "type": "string",
                        "format": "date-time",
                        "description": "The date when the application submission is due. "
                    },
                    "notification": {
                        "type": "string",
                        "format": "date-time",
                        "description": "Notification of acceptance. The date when communication sent to an author or presenter informing them that their submitted paper or proposal has been accepted for presentation at the conference in YYYY-MM-DD"
                    },
                    "start": {
                        "type": "string",
                        "format": "date-time",
                        "description": "Date of welcome reception and/or first day of conference in YYYY-MM-DD."
                    },
                    "end": {
                        "type": "string",
                        "format": "date-time",
                        "description": "The date of the last day of the conference in YYYY-MM-DD."
                    },
                    "city": {
                        "type": "string",
                        "description": "The city the conference is located in, e.g., Frankfurt"
                    },
                    "country": {
                        "type": "string",
                        "description": "The country the conference, e.g., Germany"
                    },
                    "Title": {
                        "type": "string",
                        "description": "The full, unabbreviated name for the conference of interest. For example: Algorithmic Aspects of Wireless Sensor Networks, Analysis and Simulation of Wireless and Mobile Systems, ACM International Conference on Hybrid Systems: Computation and Control."
                    },
                    "topics": {
                        "type": "string",
                        "description": "Top 10 Main Computer Science topics covered in the conference. Just list it out, no filler words. Just newline/enter in between each item."
                    },

                },
                "required": [
                    "Acronym",
                    "deadline",
                    "notification",
                    "start",
                    "end",
                    "city",
                    "country",
                    "Title",
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
    return json.loads(completion.choices[0].message.tool_calls[0].function.arguments)