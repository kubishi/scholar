import requests
from bs4 import BeautifulSoup
import pandas as pd 
import re
import random
import time
from fuzzywuzzy import fuzz

#URLS
CORE_URL = "https://portal.core.edu.au/conf-ranks/"
ERA_PDF_URL = "http://www.conferenceranks.com/data/era2010_conference_list.pdf"
SCHOLAR_URL = "https://scholar.google.com.sg/citations"

CORE_Sources = ["CORE2023", "CORE2021", "CORE2020", "CORE2018", "CORE2017", "CORE2014", "CORE2013", "ERA2010"]

def scrape_core_rankings():
    all_data = []  # List to store all dataframes
    final_df = None
    for source in CORE_Sources:
        PARAMS = {
            "search": "",
            "by": "all",
            "source": source, #Used to get different year rankings
            "sort": "atitle",
            "page": 1,
        }

        all_rows = []
        page_number = 1

        while True:
            print(f"Scraping {source} rankings page {page_number}...")
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
        filtered_df.rename(columns={'Rank': source}, inplace=True)
        all_data.append(filtered_df)
    for df in all_data:
        if final_df is None:
            final_df = df
        else:
            final_df = pd.merge(final_df, df, on=["Title", "Acronym"], how="outer")
    save_to_csv(final_df, "csa.csv")
    return final_df

def partial_match(name1, name2, threshold=85):
    x = fuzz.token_set_ratio(name1, name2)
    print(x)
    return x >= threshold

def normalize_conference_name(name):
    common_words = {"international", "conference", "symposium", "workshop", "on", "the"}
    name = re.sub(r'\([^)]*\)', '', name) #remove things in parentheses
    name = re.sub(r'[^\w\s]', '', name.lower()) #remove punctuation 
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
    #You can get away without using this super fancy header, but should help from getting google ip banning
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
        "DNT": "1", 
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
    temp_df = pd.DataFrame(columns=["Title", "Acronym", "h5_index", "h5_median"])
    h5_index = []
    h5_median = []

    #Loop through all conferences
    for query, acronym in zip(core_df["Title"], core_df["Acronym"].fillna("")):
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
        new_row = pd.DataFrame({"Title": [query], "Acronym": [acronym], "h5_index": [h5_score], "h5_median": [h5_score_median]})
        temp_df = pd.concat([temp_df, new_row], ignore_index=True)
        save_to_csv(temp_df, "temp_Conference_Scores.csv")
        time.sleep(random.uniform(2, 5)) #randomized delays so hopefully I dont get IP banned

    core_df["h5_index"] = h5_index
    core_df["h5_median"] = h5_median
    return core_df

def save_to_csv(df, filename):
    try:
        df.to_csv(filename, index=False)
        print(f"Data saved to {filename}")
    except Exception as e:
        print(f"Error saving file: {e}")

def clean_df(df):
    
    ranking_columns = ['CORE2023', 'CORE2021', 'CORE2020', 'CORE2018', 'CORE2017', 'CORE2014', 'CORE2013']
    
    #Remove any conferences that only have ERA, or h5 metrics. 
    filtered_df = df[df[ranking_columns].notna().any(axis=1)]
    return filtered_df

def main():
    # Scrape CORE rankings
    print("Fetching CORE + ERA rankings ...")
    #core_df = scrape_core_rankings()
    core_df = pd.read_csv('csa.csv')
    
    # Scrape h5 rankings:
    print("\nFetching h5 scores...")
    h5_with_core_df = extract_all_h5scores(core_df)
    
    h5_with_core_df = clean_df(h5_with_core_df)

    # Save to CSV
    save_to_csv(h5_with_core_df, "Conference_Scores.csv")
    
if __name__ == "__main__":
    main()