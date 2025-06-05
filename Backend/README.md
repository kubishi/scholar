# WORK IN PROGRESS: AcaSearch for Conferences (Kubishi)

## Overview

Full-stack project that employs semantic search, embeddings, web crawling/scraping, and chatbot integration to find and display data on academic conferences. This allows users to identify venues for academic article publication. Leverages OpenAI and Pinecone to collect/analyze and store the data, respectively, as well as numerous Python tools for database sorting, conversions, etc. Mainly uses Python for programming.

## Features

- **Semantic Search**: Utilizes natural language processing and machine learning to connect search queries and simplify venue searching using embeddings.
- **Embeddings**: Uses vector representations of text to capture meaning/context of queries in conjunction with semantic search to improve conceptual similarity between topics, storing data within Pinecone.
- **Web Crawling/Scraping**: Automatically finds and indexes conferences by exploring various academic webpages to extract venue deadlines, ranks, and other information, using OpenAI to identify and analyze specific data from the webpage
- **Chatbot Integration**: Allows users to interact with the database via chatbot, answering relevant questions for queries and directing users to improve overall efficiency and satisfaction

## Files

a. **main.py**: Handles conference data storage and retrieval using Pinecone:
   - Implements vector-based search with OpenAI embeddings for querying conferences.
   - Supports uploading conference data, including metadata and deadline processing.
   - Provides filtering options based on ranking, upcoming deadlines, and sorting criteria.
   - **Libraries Used:**
     - `openai`
     - `pinecone`
     - `pandas`
     - `argparse`
     - `dotenv`
     - `datetime`

b.  **scraper.py**: Manages the extraction and storage of conference details from web pages:
   - Fetches HTML content of a webpage and processes it into a parse tree using BeautifulSoup.
   - Uses OpenAI's API to extract specific details and metadata about conferences
   - Organizes the extracted data into a structured format
   - **Libraries Used:**
     - `openai`
     - `requests`
     - `BeautifulSoup`
     - `pandas`
     - `dotenv`
     - `json`
     - `datetime`

c. **score_ scraper.py**: Scrapes and merges conference ranking data from multiple sources:
   - Scrapes rankings from webpages/PDFs and extracts the conference titles, acronyms, and ranks.
   - Merges ranking data based on conference titles.
   - Saves the merged data for further analysis.
   - **Libraries Used:**
     - `requests`
     - `BeautifulSoup`
     - `pandas`
     - `pdfplumber`
     - `re`
##

[GitHub Link](https://github.com/kubishi/acasearch2) - Project code repository.

## Credits

**Project Lead/Administrator**: [Jared Coleman](https://github.com/jaredraycoleman)

**Backend Programmers**: [Sebastian Lange](https://github.com/MasterSebas04), [Quinn Austin](https://github.com/AustinQ23), [Colin Bajo-Smith](https://github.com/DabSquadLeader)

