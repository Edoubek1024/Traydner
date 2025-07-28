from datetime import datetime, timezone
from app.models.user_schema import UserModel, Balance
from app.db.mongo import users_collection
from firebase_admin import firestore
import logging

def create_or_update_user(uid: str, data: dict):
    try:
        now = datetime.now(timezone.utc)

        balance_data = data.get("balance") or Balance(cash=100000.0).model_dump()

        user_model = UserModel(
            uid=uid,
            email=data.get("email"),
            displayName=data.get("displayName"),
            balance=balance_data,
            createdAt=data.get("createdAt", now),
            updatedAt=now
        )

        try:
            users_collection.update_one(
                { "uid": uid },
                { "$set": user_model.dict() },
                upsert=True
            )
        except Exception as mongo_error:
            logging.error(f"MongoDB update failed for uid {uid}: {mongo_error}")
            return { "success": False, "error": "MongoDB update failed" }

        try:
            db = firestore.client()
            user_ref = db.collection("users").document(uid)
            user_ref.set(user_model.dict(), merge=True)
        except Exception as firestore_error:
            logging.warning(f"Firestore update failed for uid {uid}: {firestore_error}")

        return { "success": True }

    except Exception as outer_error:
        logging.critical(f"Unhandled error in create_or_update_user: {outer_error}")
        return { "success": False, "error": "Internal error creating/updating user" }

def get_user(uid: str):
    db = firestore.client()
    doc = db.collection("users").document(uid).get()
    return doc.to_dict() if doc.exists else None

