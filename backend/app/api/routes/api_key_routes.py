# api_key_routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from pydantic import BaseModel
from typing import Optional
import uuid
import secrets
import datetime
import bcrypt

# Import your Mongo collections (adjust import path to where you defined them)
# from your_mongo_module import api_keys_collection
# For example, if your snippet is in `db.py`:
# from db import api_keys_collection
from app.db.mongo import api_keys_collection  # <- REPLACE with real import

router = APIRouter(prefix="/api/keys", tags=["api_keys"])

# --- Auth dependency (Firebase + dev fallback) ---
# If you use Firebase, enable the firebase_admin verification path.
# Otherwise you can rely on the X-Uid header for development.
try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth
    firebase_available = True
except Exception:
    firebase_available = False


async def get_current_user_uid(authorization: Optional[str] = Header(None),
                               x_uid: Optional[str] = Header(None)) -> str:
    """
    Returns uid for the current user.

    Production flow: Authorization: Bearer <FIREBASE_ID_TOKEN> (verified via firebase_admin)
    Dev flow: X-Uid: <uid>  (useful for local testing; *do not* use in prod)

    Raises HTTPException 401 if authentication fails.
    """
    # 1) Dev fallback (explicit header) - convenient during local dev/testing
    if x_uid:
        return x_uid

    # 2) Firebase ID token flow
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="Invalid Authorization header format.")
        if not firebase_available:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail="Server not configured to verify Firebase tokens.")
        try:
            decoded = firebase_auth.verify_id_token(token)
            uid = decoded.get("uid")
            if not uid:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                    detail="Invalid token (no uid).")
            return uid
        except firebase_auth.InvalidIdTokenError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ID token.")
        except firebase_auth.ExpiredIdTokenError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Expired ID token.")
        except Exception as e:
            # generic catch for other firebase_admin errors
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail=f"Token verification failed: {str(e)}")

    # No auth info provided
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Missing authentication. Provide Authorization Bearer <token> or X-Uid header for dev.")


# --- Request / Response models ---
class CreateKeyRequest(BaseModel):
    name: Optional[str] = None  # human-friendly label e.g. "trading-bot-1"
    # you can add scopes: Optional[List[str]] = None


class CreateKeyResponse(BaseModel):
    api_key: str   # the only time the raw secret is returned: "<key_id>.<secret>"
    key_id: str
    name: Optional[str]
    created_at: datetime.datetime


# --- Key generation helper (same logic as earlier) ---
def _generate_and_store_key(uid: str, name: Optional[str] = None, secret_bytes: int = 48) -> tuple[str, str]:
    """
    Returns (combined_key, key_id) after storing hashed secret in DB.
    """
    key_id = uuid.uuid4().hex
    secret = secrets.token_urlsafe(secret_bytes)  # high entropy
    hashed = bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt())

    doc = {
        "key_id": key_id,
        "uid": uid,
        "hashed_secret": hashed.decode("utf-8"),  # store as str
        "name": name,
        "created_at": datetime.datetime.utcnow(),
        "last_used_at": None,
        "revoked": False,
    }

    api_keys_collection.insert_one(doc)
    combined = f"{key_id}.{secret}"
    return combined, key_id


# --- Routes ---
@router.post("", response_model=CreateKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(payload: CreateKeyRequest,
                         uid: str = Depends(get_current_user_uid)):
    """
    Create a new API key for the authenticated user.
    Deletes any existing key before creating a new one.
    """

    # Delete any existing key for this user
    api_keys_collection.delete_many({"uid": uid})

    # Generate and store new key
    try:
        combined_key, key_id = _generate_and_store_key(uid=uid, name=payload.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create API key: {str(e)}")

    return CreateKeyResponse(
        api_key=combined_key,
        key_id=key_id,
        name=payload.name,
        created_at=datetime.datetime.utcnow(),
    )


# Optional: list user's keys (without secrets)
@router.get("", status_code=200)
async def list_api_keys(uid: str = Depends(get_current_user_uid)):
    """
    Return the user's API key metadata (if it exists).
    """
    doc = api_keys_collection.find_one({"uid": uid}, {"hashed_secret": 0})
    if not doc:
        return {"keys": []}
    doc["_id"] = str(doc["_id"])
    return {"keys": [doc]}


# Optional: revoke
@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(key_id: str, uid: str = Depends(get_current_user_uid)):
    """
    Permanently delete an API key.
    """
    res = api_keys_collection.delete_one({"key_id": key_id, "uid": uid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return None
