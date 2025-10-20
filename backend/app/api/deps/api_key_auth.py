from fastapi import Header, HTTPException, Depends
from typing import Optional, Dict
from app.services.api_key_service import hash_key_hmac, find_key_by_hashed, mark_key_used_and_confirmed
from app.db.mongo import api_keys_collection
from datetime import datetime, timezone
import logging

def api_key_from_header(authorization: Optional[str] = Header(None)) -> Dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Malformed Authorization header")
    raw = authorization.split(" ", 1)[1].strip()
    hashed = hash_key_hmac(raw)
    doc = find_key_by_hashed(hashed)
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if doc.get("revoked_at"):
        raise HTTPException(status_code=403, detail="API key revoked")
    if doc.get("expires_at") and doc["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="API key expired")
    # attach minimal info
    return {"api_key_id": str(doc["_id"]), "user_uid": doc["user_uid"], "scopes": doc.get("scopes", [])}
