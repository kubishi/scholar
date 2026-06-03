from js import fetch, Headers
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
import json
from typing import Optional

CRAWL_KEYWORDS = ["dates", "cfp", "call-for-papers", "call", "submission", "papers", "important", "deadline", "program"]

def _make_headers():
    headers = Headers.new()
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    headers.set("Referer", "https://research.kubishi.com")
    return headers

async def _fetch_html(url: str, max_retries: int = 2) -> Optional[str]:
    headers = _make_headers()
    for attempt in range(max_retries):
        try:
            response = await fetch(url, {"headers": headers})
            if response.status != 200:
                if response.body:
                    response.body.cancel()
                continue
            return await response.text()
        except Exception as e:
            print(f"Attempt {attempt + 1} failed for {url}: {e}")
    return None

def _html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "s", "del", "strike"]):
        tag.extract()
    text = soup.get_text(separator="\n")
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())

def _extract_relevant_links(html: str, base_url: str) -> list:
    soup = BeautifulSoup(html, "html.parser")
    base_domain = urlparse(base_url).netloc
    seen = set()
    links = []
    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()
        text = a.get_text().lower().strip()
        if not href or href.startswith("#") or href.startswith("mailto:"):
            continue
        full_url = urljoin(base_url, href).split("#")[0]
        if urlparse(full_url).netloc != base_domain:
            continue
        if full_url in seen or full_url == base_url:
            continue
        combined = (text + " " + href).lower()
        if any(kw in combined for kw in CRAWL_KEYWORDS):
            seen.add(full_url)
            links.append(full_url)
    return links

async def fetch_page_content(url: str, max_retries: int = 3) -> Optional[str]:
    html = await _fetch_html(url, max_retries)
    if not html:
        return None
    return _html_to_text(html)

async def crawl_conference_site(url: str, max_subpages: int = 3) -> Optional[str]:
    html = await _fetch_html(url)
    if not html:
        return None

    sections = [f"[Main Page]\n{_html_to_text(html)}"]

    for sub_url in _extract_relevant_links(html, url)[:max_subpages]:
        try:
            sub_html = await _fetch_html(sub_url)
            if sub_html:
                sections.append(f"[{sub_url}]\n{_html_to_text(sub_html)}")
                print(f"Crawled sub-page: {sub_url}")
        except Exception as e:
            print(f"Failed to fetch sub-page {sub_url}: {e}")

    return "\n\n".join(sections)

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
                    "deadline": {"type": "string", "description": "Submission deadline. Must be in YYYY-MM-DD format only."},
                    "notification": {"type": "string", "description": "Notification date. Must be in YYYY-MM-DD format only."},
                    "start": {"type": "string", "description": "Conference start date. Must be in YYYY-MM-DD format only."},
                    "end": {"type": "string", "description": "Conference end date. Must be in YYYY-MM-DD format only."},
                    "city": {"type": "string", "description": "The city where the conference/event is held."},
                    "country": {"type": "string", "description": "The country where the conference/event is held."},
                    "Title": {"type": "string", "description": "The official name of the conference/event."},
                    "topics": {
                        "type": "string",
                        "description": "Up to 10 main topics of the conference, one per line, no bullets or numbering (e.g. 'Distributed Algorithms\\nFault Tolerance\\nGraph Theory')"
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
                "content": "Extract conference details from the page and call the function. Only use information explicitly stated on the page. All dates must be in YYYY-MM-DD format. Do not guess or infer dates that are not clearly written on the page."
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
