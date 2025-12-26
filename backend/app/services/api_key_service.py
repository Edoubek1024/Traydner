import secrets
import uuid
import datetime
import bcrypt
from app.db.mongo import api_keys_collection

def generate_api_key_for_user(uid: str, name: str | None = None, secret_bytes: int = 48) -> str:
    key_id = uuid.uuid4().hex

    secret = secrets.token_urlsafe(secret_bytes)

    secret_bytes_b = secret.encode("utf-8")
    hashed = bcrypt.hashpw(secret_bytes_b, bcrypt.gensalt())

    doc = {
        "key_id": key_id,
        "uid": uid,
        "hashed_secret": hashed.decode("utf-8"),
        "name": name,
        "created_at": datetime.datetime.utcnow(),
        "last_used_at": None,
        "revoked": False,
    }

    api_keys_collection.insert_one(doc)

    combined_key = f"{key_id}.{secret}"
    return combined_key

def verify_api_key(combined_key: str) -> dict | None:
    try:
        key_id, secret = combined_key.split(".", 1)
    except ValueError:
        return None

    doc = api_keys_collection.find_one({"key_id": key_id})
    if not doc:
        return None
    if doc.get("revoked"):
        return None

    hashed = doc["hashed_secret"].encode("utf-8")
    if bcrypt.checkpw(secret.encode("utf-8"), hashed):
        # optionally update last_used_at
        api_keys_collection.update_one({"_id": doc["_id"]},
                                       {"$set": {"last_used_at": datetime.datetime.utcnow()}})
        return doc
    return None
