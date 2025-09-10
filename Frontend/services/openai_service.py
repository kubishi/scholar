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
