import secrets
import uuid
import datetime
import bcrypt
from app.db.mongo import api_keys_collection

# reuse your existing Mongo client/code; expects `api_keys_collection` to exist
# from your snippet:
# client = MongoClient(MONGO_URI)
# db = client[MONGO_DB_NAME]
# api_keys_collection = db["api_keys"]

def generate_api_key_for_user(uid: str, name: str | None = None, secret_bytes: int = 48) -> str:
    """
    Generate a new API key attached to `uid` and store hashed secret in MongoDB.

    Returns:
        combined_key (str): the only time the raw key is shown to the caller,
                            format "<key_id>.<secret>"
    Notes:
        - Only the hashed secret is stored in DB (bcrypt). Keep `combined_key` safe.
        - `name` is an optional human-friendly label (e.g., "trading-bot-1").
    """
    # 1) Create an id to identify the key record (stored in DB plaintext)
    key_id = uuid.uuid4().hex  # 32 hex chars

    # 2) Create a high-entropy secret (URL-safe)
    # Use token_urlsafe(n) which yields ~1.3*n bits; secret_bytes controls entropy
    secret = secrets.token_urlsafe(secret_bytes)

    # 3) Hash the secret using bcrypt before storing
    secret_bytes_b = secret.encode("utf-8")
    hashed = bcrypt.hashpw(secret_bytes_b, bcrypt.gensalt())  # returns bytes

    # 4) Build DB document
    doc = {
        "key_id": key_id,
        "uid": uid,
        "hashed_secret": hashed.decode("utf-8"),  # store as string
        "name": name,
        "created_at": datetime.datetime.utcnow(),
        "last_used_at": None,
        "revoked": False,
    }

    # 5) Insert into MongoDB
    api_keys_collection.insert_one(doc)

    # 6) Return combined key to the caller (only time they see it)
    combined_key = f"{key_id}.{secret}"
    return combined_key

def verify_api_key(combined_key: str) -> dict | None:
    """
    Verify combined_key format "<key_id>.<secret>".
    Returns the key document if valid, else None.
    """
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
