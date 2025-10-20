# app/core/auth_dependencies.py
from fastapi import Header, HTTPException, status
from datetime import datetime
import bcrypt
from app.db.mongo import api_keys_collection, users_collection

async def get_current_user_from_api_key(authorization: str = Header(None)):
    if not authorization or not authorization.split(" ", 1)[0].lower() == "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Missing or invalid Authorization header")

    try:
        combined = authorization.split(" ", 1)[1].strip()
        key_id, secret = combined.split(".", 1)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="API key format invalid. Expected '<key_id>.<secret>'")

    key_doc = api_keys_collection.find_one({"key_id": key_id})
    if not key_doc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    hashed = key_doc.get("hashed_secret")
    if not hashed or not bcrypt.checkpw(secret.encode("utf-8"), hashed.encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    api_keys_collection.update_one({"_id": key_doc["_id"]},
                                   {"$set": {"last_used_at": datetime.utcnow()}})

    uid = key_doc.get("uid")  # you store 'uid' in the api_keys doc
    if not uid:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="API key missing associated uid")

    if not users_collection.find_one({"uid": uid}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {"user_uid": uid}
