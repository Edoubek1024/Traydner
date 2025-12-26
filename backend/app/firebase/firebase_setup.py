import os, json
import firebase_admin
from firebase_admin import credentials

def init_firebase():
    if firebase_admin._apps:
        return firebase_admin.get_app()

    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw:
        cred = credentials.Certificate(json.loads(raw))
        return firebase_admin.initialize_app(cred)

    path = os.getenv("SERVICE_ACCOUNT_PATH")
    if path and os.path.exists(path):
        cred = credentials.Certificate(path)
        return firebase_admin.initialize_app(cred)

    cred = credentials.ApplicationDefault()
    return firebase_admin.initialize_app(cred)
