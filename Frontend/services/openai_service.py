from flask import current_app
from openai import OpenAI

_client = None
def _client_or_init():
    global _client
    if _client is None:
        _client = OpenAI(api_key=current_app.config["OPENAI_API_KEY"])
    return _client

def embed(text: str):
    if not text:
        raise ValueError("Input text for embedding cannot be empty.")
    resp = _client_or_init().embeddings.create(
        input=text,
        model=current_app.config["EMBEDDING_MODEL"]
    )
    return resp.data[0].embedding

def pdf_summary(text: str):
    if not text:
        raise ValueError("Input text for summarization cannot be empty.")
    resp = _client_or_init().chat.completions.create(
        model=current_app.config["CHAT_MODEL"],
        messages=[
            {
                "role": "system",
                "content": "You are a helpful assistant that summarizes academic papers."
            },
            {
                "role": "user",
                "content": f"Please provide a concise 2–3 sentence summary of each paper, optimized for semantic search indexing:\n\n{text}"
            }
        ],
        max_tokens=300,
        #temperature=0.5,
    )
    return resp.choices[0].message.content.strip()