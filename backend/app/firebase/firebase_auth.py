from firebase_admin import auth
from fastapi import Request, HTTPException, Depends
from typing import Dict

async def firebase_user(request: Request) -> Dict:
    auth_header = request.headers.get("authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed authorization header")

    token = auth_header.replace("Bearer ", "").strip()

    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=403, detail="Invalid Firebase ID token")
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=403, detail="Expired Firebase ID token")
    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Token verification failed: {e}")
