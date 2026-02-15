from urllib.parse import urlparse, quote
from datetime import datetime
from js import fetch, Headers

async def brave_search_conference_website(conf_name, conf_acronym, env, count=10):
    # Access the API key from Cloudflare Secrets instead of os.getenv
    api_key = env.BRAVE_API_KEY
    
    # Workers are non-blocking; we use the current year for the search query
    year = 2026 
    query_text = f"Find me the {year} conference website for the {conf_name} ({conf_acronym})"
    encoded_query = quote(query_text)
    
    # Construct the URL with query parameters
    url = f"https://api.search.brave.com/res/v1/web/search?q={encoded_query}&count={count}"
    
    # Workers require the Headers object
    headers = Headers.new()
    headers.set("Accept", "application/json")
    headers.set("X-Subscription-Token", api_key)
    
    try:
        # Perform the asynchronous fetch
        response = await fetch(url, headers=headers)
        
        if response.status != 200:
            return None
        
        # Parse JSON asynchronously
        results = await response.json()
        
        # Handle the JS-to-Python object conversion (using .to_py() if needed, 
        # but standard dict access often works for JSON results)
        data = results.to_py() if hasattr(results, "to_py") else results
        items = data.get("web", {}).get("results", [])

        blacklist = [
            "wikicfp.com", "guide2research.com", "eventbrite.com", "medium.com",
            "twitter.com", "linkedin.com", "facebook.com", "youtube.com",
            "link.springer.com", "clocate.com", "myhuiban.com"
        ]

        for item in items:
            candidate = item.get("url")
            if not candidate:
                continue
            host = urlparse(candidate).hostname or ""
            if not any(bad in host for bad in blacklist):
                return candidate 

    except Exception as e:
        print(f"Brave Search Error: {e}")
        return None

    return None