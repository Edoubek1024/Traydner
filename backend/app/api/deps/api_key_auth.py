from fastapi import Header, HTTPException, Depends
from typing import Optional, Dict
from app.services.api_key_service import verify_api_key
from app.db.mongo import api_keys_collection
from datetime import datetime, timezone

def api_key_from_header(authorization: Optional[str] = Header(None)) -> Dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Malformed Authorization header")

    combined = authorization.split(" ", 1)[1].strip()

    doc = verify_api_key(combined)
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid API key")

    uid = doc.get("user_uid") or doc.get("uid")
    if not uid:
        raise HTTPException(status_code=500, detail="API key missing associated uid")

    return {"user_uid": uid}