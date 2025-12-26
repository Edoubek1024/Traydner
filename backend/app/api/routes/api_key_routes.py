# api_key_routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from pydantic import BaseModel
from typing import Optional
import uuid
import secrets
import datetime
import bcrypt

from app.db.mongo import api_keys_collection

router = APIRouter(prefix="/api/keys", tags=["api_keys"])

try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth
    firebase_available = True
except Exception:
    firebase_available = False


async def get_current_user_uid(authorization: Optional[str] = Header(None),
                               x_uid: Optional[str] = Header(None)) -> str:
    if x_uid:
        return x_uid

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
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail=f"Token verification failed: {str(e)}")

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Missing authentication. Provide Authorization Bearer <token> or X-Uid header for dev.")


class CreateKeyRequest(BaseModel):
    name: Optional[str] = None


class CreateKeyResponse(BaseModel):
    api_key: str
    key_id: str
    name: Optional[str]
    created_at: datetime.datetime


def _generate_and_store_key(uid: str, name: Optional[str] = None, secret_bytes: int = 48) -> tuple[str, str]:

    key_id = uuid.uuid4().hex
    secret = secrets.token_urlsafe(secret_bytes)
    hashed = bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt())

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
    combined = f"{key_id}.{secret}"
    return combined, key_id


@router.post("", response_model=CreateKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(payload: CreateKeyRequest,
                         uid: str = Depends(get_current_user_uid)):


    api_keys_collection.delete_many({"uid": uid})

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


@router.get("", status_code=200)
async def list_api_keys(uid: str = Depends(get_current_user_uid)):
    doc = api_keys_collection.find_one({"uid": uid}, {"hashed_secret": 0})
    if not doc:
        return {"keys": []}
    doc["_id"] = str(doc["_id"])
    return {"keys": [doc]}


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(key_id: str, uid: str = Depends(get_current_user_uid)):
    res = api_keys_collection.delete_one({"key_id": key_id, "uid": uid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return None
