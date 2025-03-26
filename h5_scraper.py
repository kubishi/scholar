import requests
from bs4 import BeautifulSoup
import pandas as pd
import random
import time

from fuzzywuzzy import fuzz
import re

def partial_match(name1, name2, threshold=85):
    print(fuzz.token_set_ratio(name1, name2))
    return fuzz.token_set_ratio(name1, name2) >= threshold


def normalize_conference_name(name):
    common_words = {"international", "conference", "symposium", "workshop", "on", "the"}
    name = re.sub(r'[^\w\s]', '', name.lower())  # Remove punctuation
    words = name.split()
    words = [word for word in words if word not in common_words]  # Remove stopwords
    return " ".join(sorted(words))  # Sort words for consistency


def construct_search_url(query):
    base_url = "https://scholar.google.com.sg/citations"
    params = {
        "hl": "en",
        "view_op": "search_venues",
        "vq": query.replace(" ", "+"),  # Replace spaces with '+'
        "btnG": ""
    }
    return f"{base_url}?{'&'.join([f'{k}={v}' for k, v in params.items()])}"

def scrape_venue_data(url, query, acronym):
    
    # Headers to mimic a real browser request
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    ]

    # Headers to mimic a real browser request
    headers = {
        "User-Agent": random.choice(user_agents),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Referer": "https://scholar.google.com/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "DNT": "1",  # Do Not Track
    }

    # Send a GET request to the URL with headers
    response = requests.get(url, headers=headers)

    # Check if the request was successful
    if response.status_code == 200:
        # Parse the HTML content using BeautifulSoup
        soup = BeautifulSoup(response.content, 'html.parser')

        # Find all the rows in the table containing the h5 scores
        rows = soup.find_all('tr')

        # Iterate over each row
        for row in rows:

            # Find the h5 score and name within the row
            h5_score_index = row.find_next('td', class_='gsc_mvt_n')
            #Get the secound gsc_mvt_n element to get h5 median
            h5_score_median = row.find_next('td', class_='gsc_mvt_n').find_next('td', class_='gsc_mvt_n')
            h5_name = row.find_next('td', class_='gsc_mvt_t')
            
            if h5_score_index and h5_name and h5_score_median:
                if partial_match(query, h5_name.text) or acronym in h5_name.text: #reloop through the next row if the name or acronym isnt in the substring
                    return int(h5_score_index.text), int(h5_score_median.text)
                
        # If no match found, try searching with the acronym
        if acronym:
            # Construct the search URL using the acronym
            acronym_url = construct_search_url(acronym)
            
            response = requests.get(acronym_url, headers=headers)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')
                rows = soup.find_all('tr')

                for row in rows:
                    h5_score_index = row.find_next('td', class_='gsc_mvt_n')
                    h5_score_median = row.find_next('td', class_='gsc_mvt_n').find_next('td', class_='gsc_mvt_n')
                    h5_name = row.find_next('td', class_='gsc_mvt_t')

                    if h5_score_index and h5_name and h5_score_median:
                        if acronym in h5_name.text:  # Only use the acronym search
                            return int(h5_score_index.text), int(h5_score_median.text)
        
    else:
        print(f"Failed to retrieve the page. Status code: {response.status_code}")
        return None, None


        
# URL of the Google Scholar ENG+CS papers page
url = "https://scholar.google.com.sg/citations?view_op=top_venues&hl=en&vq=eng"

#Core Scores
core_df = pd.read_csv('csa.csv')  

h5_index = []
h5_median = []

for query, acronym in zip(core_df["Title"], core_df["Acronym"]):
    # Construct the search URL
    search_url = construct_search_url(query)
    print(f"Search URL: {search_url}")

    # Scrape the data
    result = scrape_venue_data(search_url, query, acronym)
    if result:
        h5_score, h5_score_median = result
        print("Scores:", h5_score, h5_score_median)
    else:
        
        h5_score, h5_score_median = None, None
    h5_index.append(h5_score if h5_score else None)
    h5_median.append(h5_score_median if h5_score_median else None)
    
    time.sleep(random.uniform(2, 5)) #randomized delays so hopefully I dont get IP banned

core_df["h5_index"] = h5_index
core_df["h5_median"] = h5_median
core_df.to_csv('csa_with_h5_scores.csv', index=False)
