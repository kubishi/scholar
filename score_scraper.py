import requests
from bs4 import BeautifulSoup
import pandas as pd
import pdfplumber  # For extracting data from PDF
import re

def scrape_core_rankings():
    BASE_URL = "https://portal.core.edu.au/conf-ranks/"
    PARAMS = {
        "search": "",
        "by": "all",
        "source": "CORE2023",
        "sort": "atitle",
        "page": 1,
    }

    all_rows = []
    page_number = 1

    while True:
        print(f"Scraping CORE rankings page {page_number}...")
        PARAMS["page"] = page_number
        response = requests.get(BASE_URL, params=PARAMS)
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
    save_to_csv(filtered_df, "csa")
    return filtered_df

def extract_era_rankings():
    pdf_url = "http://www.conferenceranks.com/data/era2010_conference_list.pdf"
    response = requests.get(pdf_url)
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
                        era_score_match = re.search(r'\b(A|B|C|D|E|F|Not ranked)\b', line)  # Fixed ERA score matching

                        if era_score_match:
                            era_score = era_score_match.group()

                            # Extract the title (everything before the ERA score)
                            title_match = re.search(r'^\d+\s+(.*?)(?=\s+[A-Z]{2,})', line[:era_score_match.start()])  # Capture the title before the ERA score and after the id
                            if title_match:
                                title = title_match.group(1).strip()
                                #print(title)
                                era_data.append({"Title": title, "ERA Score": era_score})


    # Create a DataFrame
    era_df = pd.DataFrame(era_data)
    save_to_csv(era_df, "era")
    return era_df

def merge_data(core_df, era_df):
    # Merge the data
    
    # Merge the DataFrames on the 'Title' column
    merged_df = pd.merge(core_df, era_df, on='Title', how='left')
    return merged_df


def save_to_csv(df, filename):
    df.to_csv(filename, index=False)
    print(f"Data saved to {filename}")

# Main Function
if __name__ == "__main__":
    # Scrape CORE rankings
    core_df = scrape_core_rankings()
    #core_df = pd.read_csv('csa.csv')
    # Extract ERA rankings
    era_df = extract_era_rankings()
    #era_df = pd.read_csv('era.csv')

    # Merge the data
    merged_df = merge_data(core_df, era_df)

    # Save to CSV
    merged_df.rename(columns={'Rank': 'Core'}, inplace=True)

    save_to_csv(merged_df, "conference_rankings_with_era.csv")