from datetime import datetime
from flask import redirect, url_for, request
from datetime import datetime
from rapidfuzz import fuzz
RANK_ORDER = {
    "A*": 4,
    "A": 3,
    "B": 2,
    "C": 1,
    "UNRANKED": 0
}

def city_country_filter(value):
    city, country = value
    return f"{city}, {country}"

def to_gcal_datetime_filter(value):
    if not value:
        return ""
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.strftime("%Y%m%dT%H%M%SZ")
    except Exception:
        return value

def format_date(value, format="%b %d, %Y"):
    if not value:
        return ""
    try:
        if value.endswith("Z"):
            value = value[:-1]
        dt = datetime.fromisoformat(value)
        return dt.strftime(format)
    except Exception:
        return value

def convert_date_format(date_str):
    """Convert yyyy-mm-dd to mm-dd-yyyy"""
    return datetime.strptime(date_str, "%Y-%m-%d").strftime("%m-%d-%Y") if date_str else ""

def redirect_clean_params(endpoint_name):
    """Redirect to the same endpoint with only non-empty query params."""
    params = request.args.to_dict()
    clean_params = {k: v for k, v in params.items() if v}

    if params != clean_params:
        return redirect(url_for(endpoint_name, **clean_params))
    return None

def is_match(article, start_date=None, end_date=None, location="", ranking_source="", ranking_score=""):
    """Filter article metadata based on date, location, and ranking."""
    try:
        metadata = article.get("metadata", {})

        # Date filter
        if start_date and end_date:
            start_str = metadata.get("start")
            if not start_str:
                return False
            article_start = datetime.fromisoformat(start_str.rstrip("Z"))
            if not (start_date <= article_start <= end_date):
                return False

        # Location filter
        if location:
            article_loc_country = metadata.get("country", "").strip().lower()
            article_loc_city = metadata.get("city", "").strip().lower()
            if fuzz.partial_ratio(location, article_loc_country) < 90 and fuzz.partial_ratio(location, article_loc_city) < 90:
                return False

        # Ranking score filter
        if ranking_source == "scholar":
            matched_key = next((key for key in metadata if key.lower().startswith("h5_index")), None)
            if not matched_key:
                return False
            article_score = metadata.get(matched_key, "")
            try:
                article_score_val = float(article_score)
                if float(ranking_score) >= article_score_val:
                    return False
            except (ValueError, TypeError):
                return False

        elif ranking_source:
            matched_key = next((key for key in metadata if key.lower().startswith(ranking_source)), None)
            if not matched_key:
                return False

            article_score = metadata.get(matched_key, "").strip().upper()
            if ranking_score:
                try:
                    user_rank = RANK_ORDER[ranking_score]
                    article_rank = RANK_ORDER[article_score]
                    if article_rank < user_rank:
                        return False
                except KeyError:
                    return False

        return True

    except Exception as e:
        print(f"Filter error on article: {e}")
        return False