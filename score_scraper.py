import requests
from bs4 import BeautifulSoup
import pandas as pd
import pdfplumber  
import re
import random
import time
from fuzzywuzzy import fuzz

#URLS
CORE_URL = "https://portal.core.edu.au/conf-ranks/"
ERA_PDF_URL = "http://www.conferenceranks.com/data/era2010_conference_list.pdf"
SCHOLAR_URL = "https://scholar.google.com.sg/citations"
     
def scrape_core_rankings():
    PARAMS = {
        "search": "",
        "by": "all",
        "source": "CORE2023", #Used to get different year rankings
        "sort": "atitle",
        "page": 1,
    }

    all_rows = []
    page_number = 1

    while True:
        print(f"Scraping CORE rankings page {page_number}...")
        PARAMS["page"] = page_number
        response = requests.get(CORE_URL, params=PARAMS)
        soup = BeautifulSoup(response.text, "html.parser")

        # Find the table
        table = soup.find("table")
        if not table:
            break  # Stop if no more data is found

        # Extract headers (only once)
        if "headers" not in scrape_core_rankings.__dict__:
            scrape_core_rankings.headers = [th.text.strip() for th in table.find_all("th")]

        # Extract rows
        for row in table.find_all("tr", class_=["evenrow", "oddrow"]):
            cells = [cell.text.strip() for cell in row.find_all("td")]
            all_rows.append(cells)

        page_number += 1

    # Create a DataFrame
    df = pd.DataFrame(all_rows, columns=scrape_core_rankings.headers)

    # Filter the DataFrame to include only Title, Source, and Rank
    filtered_df = df[["Title", "Acronym", "Rank"]]
    save_to_csv(filtered_df, "csa.csv")
    return filtered_df

def extract_era_rankings():
    response = requests.get(ERA_PDF_URL)
    with open("era2010_conference_list.pdf", "wb") as f:
        f.write(response.content)

    era_data = []
    with pdfplumber.open("era2010_conference_list.pdf") as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                for line in text.split("\n"):
                    line = line.strip()
                    if line:
                        # Use regex to extract the ERA score
                        era_score_match = re.search(r'\b(A|B|C|D|E|F|Not ranked)\b', line) 

                        if era_score_match:
                            era_score = era_score_match.group()

                            # Extract the title (everything before the ERA score)
                            # Capture the title before the ERA score and after the id
                            title_match = re.search(r'^\d+\s+(.*?)(?=\s+[A-Z]{2,})', line[:era_score_match.start()])
                            if title_match:
                                title = title_match.group(1).strip()
                                era_data.append({"Title": title, "ERA Score": era_score})


    # Create a DataFrame
    era_df = pd.DataFrame(era_data)
    save_to_csv(era_df, "era.csv")
    return era_df

def partial_match(name1, name2, threshold=85):
    x = fuzz.token_set_ratio(name1, name2)
    print(x)
    return x >= threshold

def normalize_conference_name(name):
    common_words = {"international", "conference", "symposium", "workshop", "on", "the"}
    name = re.sub(r'[^\w\s]', '', name.lower())  # Remove punctuation
    words = name.split()
    words = [word for word in words if word not in common_words]  # Remove stopwords
    return " ".join(sorted(words))  # Sort words for consistency

def construct_search_url(query):
    params = {
        "hl": "en",
        "view_op": "search_venues",
        "vq": query.replace(" ", "+"),  # Replace spaces with '+'
        "btnG": ""
    }
    return f"{SCHOLAR_URL}?{'&'.join([f'{k}={v}' for k, v in params.items()])}"

def scrape_h5data(url, query, acronym):
    
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
                        if "(" + acronym + ")" in h5_name.text:  # Only use the acronym search
                            return int(h5_score_index.text), int(h5_score_median.text)
        
    else:
        print(f"Failed to retrieve the page. Status code: {response.status_code}")
        return None, None

def extract_all_h5scores(core_df): 
    """Get h5 scores for all conferences from the core df."""
    
    h5_index = []
    h5_median = []
    
    #Loop through all conferences
    for query, acronym in zip(core_df["Title"], core_df["Acronym"]):
        # Construct the search URL
        search_url = construct_search_url(normalize_conference_name(query))
        print(f"Search URL: {search_url}")

        # Scrape the data
        result = scrape_h5data(search_url, query, acronym)
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
    return core_df

def merge_data(core_df, era_df):
    """Merge multiple DataFrames on the 'Title' column."""
    # Merge the DataFrames on the 'Title' column
    merged_df = pd.merge(core_df, era_df, on='Title', how='left')
    return merged_df

def save_to_csv(df, filename):
    """Save df to a CSV."""
    df.to_csv(filename, index=False)
    print(f"Data saved to {filename}")

# Main Function
if __name__ == "__main__":
    # Scrape CORE rankings
    print("Fetching CORE rankings...")
    core_df = scrape_core_rankings()
    #core_df = pd.read_csv('csa.csv')
    # Extract ERA rankings
    print("\nFetching ERA scores...")

    era_df = extract_era_rankings()
    #era_df = pd.read_csv('era.csv')
    # Scrape h5 rankings:
    print("\nFetching h5 scores...")
    h5_with_core_df = extract_all_h5scores(core_df)

    # Merge the data
    merged_df = merge_data(h5_with_core_df, era_df)

    # Save to CSV
    merged_df.rename(columns={'Rank': 'Core'}, inplace=True)

    save_to_csv(merged_df, "Conference_Scores.csv")