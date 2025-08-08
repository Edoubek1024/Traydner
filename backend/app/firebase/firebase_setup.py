import firebase_admin
from firebase_admin import credentials
import os

SERVICE_ACCOUNT_PATH = os.path.join(
    os.path.dirname(__file__),
    "traydner-firebase-adminsdk-fbsvc-14b3275dc0.json"
)

if not firebase_admin._apps:
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)
