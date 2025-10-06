# app/firebase/firebase_setup.py
import os, json
import firebase_admin
from firebase_admin import credentials

def init_firebase():
    if firebase_admin._apps:
        return firebase_admin.get_app()

    # 1) If provided as raw JSON in env (Secret Manager -> env var)
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw:
        cred = credentials.Certificate(json.loads(raw))
        return firebase_admin.initialize_app(cred)

    # 2) If provided as a mounted file path (Secret Manager -> volume)
    path = os.getenv("SERVICE_ACCOUNT_PATH")
    if path and os.path.exists(path):
        cred = credentials.Certificate(path)
        return firebase_admin.initialize_app(cred)

    # 3) Fall back to Application Default Credentials (Cloud Run SA)
    #    Works for many Admin SDK operations on GCP.
    cred = credentials.ApplicationDefault()
    return firebase_admin.initialize_app(cred)
