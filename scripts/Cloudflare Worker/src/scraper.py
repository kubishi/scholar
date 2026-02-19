from js import fetch, Headers

from bs4 import BeautifulSoup
import json
from typing import Optional

async def fetch_page_content(url: str, max_retries: int = 3) -> Optional[str]:
    headers = Headers.new()
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    headers.set("Referer", "https://research.kubishi.com")
    
    for attempt in range(max_retries):
        try:
            # Use Worker's native async fetch instead of requests
            response = await fetch(url, headers=headers)
            if response.status != 200:
                if response.body:
                    response.body.cancel()  # prevent memory leaks
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

async def extract_conference_details(page_content: str, api_key: str):

    headers = Headers.new()
    headers.set("Authorization", f"Bearer {api_key}")
    headers.set("Content-Type", "application/json")

    tools = [{
        "type": "function",
        "function": {
            "name": "get_info",
            "description": "Get the different pieces of information about the conference/event.",
            "parameters": {
                "type": "object",
                "properties": {
                    "Acronym": {"type": "string", "description": "The acronym of the conference/event."},
                    "deadline": {"type": "string", "format": "date-time", "description": "The date when the application submission is due."},
                    "notification": {"type": "string", "format": "date-time", "description": "The date when notification is sent to the applicants."},
                    "start": {"type": "string", "format": "date-time", "description": "The start date of the conference/event."},
                    "end": {"type": "string", "format": "date-time", "description": "The end date of the conference/event."},
                    "city": {"type": "string", "description": "The city where the conference/event is held."},
                    "country": {"type": "string", "description": "The country where the conference/event is held."},
                    "Title": {"type": "string", "description": "The official name of the conference/event."},
                    "topics": {
                        "type": "string",
                        "description": "Top 10 Main Computer Science topics separated by newline"
                    }
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
            }
        }
    }]

    body = {
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": "Extract relevant conference details and call the function."
            },
            {
                "role": "user",
                "content": page_content[:15000]  # Prevent token overflow
            }
        ],
        "tools": tools,
        "tool_choice": {
            "type": "function",
            "function": {"name": "get_info"}
        }
    }

    response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
            "method": "POST",
            "headers": headers,
            "body": json.dumps(body)
        }
    )

    if response.status != 200:
        error_text = await response.text()
        raise Exception(f"OpenAI API Error: {error_text}")

    result = await response.json()
    data = result.to_py() if hasattr(result, "to_py") else result

    tool_call = data["choices"][0]["message"]["tool_calls"][0]
    arguments = tool_call["function"]["arguments"]

    return json.loads(arguments)