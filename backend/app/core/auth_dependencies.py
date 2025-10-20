# app/core/auth_dependencies.py
from fastapi import Header, HTTPException, status, Depends
from datetime import datetime
import bcrypt

from app.db.mongo import api_keys_collection, users_collection  # adjust if path differs

async def get_current_user_from_api_key(authorization: str = Header(None)):
    """
    Authenticates requests using an API key in the Authorization header.
    Expected format: Authorization: Bearer <key_id>.<secret>
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Missing or invalid Authorization header")

    combined = authorization.split(" ", 1)[1].strip()
    # Expect format "<key_id>.<secret>"
    try:
        key_id, secret = combined.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="API key format invalid. Expected '<key_id>.<secret>'")

    # Find the api_key document by key_id
    key_doc = api_keys_collection.find_one({"key_id": key_id})
    if not key_doc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    # key_doc should have "hashed_secret" stored (bcrypt output string)
    stored_hashed = key_doc.get("hashed_secret")
    if not stored_hashed:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="API key record malformed")

    # Verify secret using bcrypt
    try:
        secret_ok = bcrypt.checkpw(secret.encode("utf-8"), stored_hashed.encode("utf-8"))
    except Exception:
        secret_ok = False

    if not secret_ok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    # Optionally: update last_used_at on the api_keys collection
    api_keys_collection.update_one({"_id": key_doc["_id"]},
                                   {"$set": {"last_used_at": datetime.utcnow()}})

    # Fetch the user by uid stored on the key doc (assuming you store uid on the key)
    uid = key_doc.get("uid")
    if not uid:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="API key missing associated uid")

    user = users_collection.find_one({"uid": uid})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # return user (or a sanitized subset if you prefer)
    return user
