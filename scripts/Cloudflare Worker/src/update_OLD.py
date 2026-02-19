from workers import WorkerEntrypoint, Response, fetch
import json

# Assuming these are your local helper modules
from scraper import fetch_page_content, extract_conference_details
from GPTsearchURL import brave_search_conference_website

class Default(WorkerEntrypoint):
    # 1. THE AUTOMATION ENTRY POINT
    # This method is triggered by the Cron schedule defined in wrangler.toml
    async def scheduled(self, event, env, ctx):
        print(f"Cron triggered at: {event.scheduledTime}")
        await self.perform_updates()

    # 2. THE MANUAL ENTRY POINT (Optional)
    # Allows you to trigger the update by visiting the Worker's URL
    async def fetch(self, request):
        await self.perform_updates()
        return Response("Update process completed successfully.")

    # 3. THE CORE LOGIC
    async def perform_updates(self):
        # Fetch the 3 oldest conferences that need updating
        # Use .to_py() to convert the JavaScript result into a Python list
        res = await self.env.DB.prepare(
        "SELECT id, title, acronym, url, start_date "
        "FROM conferences "
        "WHERE start_date < DATE('now') "
        "ORDER BY start_date DESC "
        "LIMIT 10"
        ).all()
        
        conferences = res.results.to_py()

        for conf in conferences:
            try:
                # Search for the website
                url = await brave_search_conference_website(
                conf.get("title"), 
                conf.get("acronym", ""), 
                self.env  # This is needed for the API key!
                )
                
                if url and url != conf.get("url"):
                # FIX 2: fetch_page_content is already async in your file, just await it
                    page_content = await fetch_page_content(url) 
            
                    if not page_content:
                        continue
            
                    # FIX 3: extract_conference_details is async in your scraper.py
                    details = await extract_conference_details(page_content, self.env.OPENAI_API_KEY)
                    
                    # Update D1 Database
                    # We use an UPSERT (INSERT ... ON CONFLICT) for SQLite
                    sql = """
                    INSERT INTO submitted_conf (
                        id, conference_name, city, country, deadline, 
                        start_date, end_date, topics, url, submitter_id, 
                        submitter_name, submitter_email, edit_type, status, submitted_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', datetime('now'))
                    ON CONFLICT(id) DO UPDATE SET 
                        conference_name = excluded.conference_name,
                        city = excluded.city,
                        country = excluded.country,
                        deadline = excluded.deadline,
                        start_date = excluded.start_date,
                        end_date = excluded.end_date,
                        topics = excluded.topics,
                        url = excluded.url,
                        submitter_id = excluded.submitter_id,
                        submitter_name = excluded.submitter_name,
                        submitter_email = excluded.submitter_email,
                        edit_type = excluded.edit_type,
                        status = 'waiting',
                        submitted_at = datetime('now')
                    """
                    
                    await self.env.DB.prepare(sql).bind(
                        conf["id"],                                 # id
                        details.get("title", conf["title"]),        # conference_name
                        details.get("city"),                        # city
                        details.get("country"),                     # country
                        details.get("deadline"),                    # deadline
                        details.get("start_date"),                  # start_date
                        details.get("end_date"),                    # end_date
                        json.dumps(details.get("topics", [])),      # topics (stored as JSON string)
                        url,                                        # url
                        "system-bot",                               # submitter_id
                        "Automation Worker",                        # submitter_name
                        "admin@yourdomain.com",                     # submitter_email
                        "auto-update"                               # edit_type
                    ).run()
                    
                    print(f"Successfully updated: {conf.get('title')}")
                else:
                    print(f"No new URL found for {conf.get('title')}")

            except Exception as e:
                # Log error but continue with the next conference
                print(f"Error processing {conf.get('title', 'Unknown')}: {str(e)}")