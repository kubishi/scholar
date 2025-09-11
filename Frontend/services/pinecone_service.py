from flask import current_app
from pinecone import Pinecone

_index = None

def _get_index():
    global _index
    if _index is None:
        pc = Pinecone(api_key=current_app.config["PINECONE_API_KEY"])
        _index = pc.Index(host=current_app.config["PINECONE_HOST"])
    return _index

def describe_count() -> int:
    stats = _get_index().describe_index_stats()
    return stats.get("total_vector_count", 0)

def fetch_by_id(conf_id: str):
    return _get_index().fetch(ids=[conf_id])

def upsert_vector(vector: dict):
    # vector = {"id": "...", "values": [...], "metadata": {...}}
    _get_index().upsert(vectors=[vector])

def semantic_query(vector, top_k=50, include_metadata=True):
    return _get_index().query(vector=vector, top_k=top_k, include_metadata=include_metadata)

def id_query(conf_id: str):
    return _get_index().query(id=conf_id, top_k=1, include_metadata=True, include_values=False)
