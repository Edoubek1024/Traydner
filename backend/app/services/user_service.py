from datetime import datetime, timezone
from app.models.user_schema import UserModel, Balance
from app.db.mongo import users_collection
from firebase_admin import firestore
import logging

def create_or_update_user(uid: str, data: dict):
    try:
        now = datetime.now(timezone.utc)

        existing = users_collection.find_one({"uid": uid}) or {}

        first = (data.get("firstName") or existing.get("firstName") or "").strip()
        last  = (data.get("lastName")  or existing.get("lastName")  or "").strip()

        display = (data.get("displayName") or "").strip()
        if not display:
            display = (f"{first} {last}").strip() or (existing.get("displayName") or "").strip() or None

        balance_data = (
            data.get("balance")
            or existing.get("balance")
            or Balance(cash=100000.0).model_dump()
        )

        user_model = UserModel(
            uid=uid,
            email=data.get("email") or existing.get("email"),
            firstName=first or None,
            lastName=last or None,
            displayName=display,
            balance=balance_data,
            createdAt=existing.get("createdAt") or data.get("createdAt") or now,
            updatedAt=now,
        )

        to_set = user_model.model_dump(exclude_none=True)

        try:
            users_collection.update_one({"uid": uid}, {"$set": to_set}, upsert=True)
        except Exception as mongo_error:
            logging.error(f"MongoDB update failed for uid {uid}: {mongo_error}")
            return {"success": False, "error": "MongoDB update failed"}

        try:
            db = firestore.client()
            db.collection("users").document(uid).set(to_set, merge=True)
        except Exception as firestore_error:
            logging.warning(f"Firestore update failed for uid {uid}: {firestore_error}")

        return {"success": True}

    except Exception as outer_error:
        logging.critical(f"Unhandled error in create_or_update_user (uid={uid}): {outer_error}")
        return {"success": False, "error": "Internal error creating/updating user"}

def get_user(uid: str):
    doc = users_collection.find_one({"uid": uid})
    if doc:
        doc.pop("_id", None)
        return doc
    db = firestore.client()
    fdoc = db.collection("users").document(uid).get()
    return fdoc.to_dict() if fdoc.exists else None


def get_user_balance(uid: str) -> dict:
    doc = users_collection.find_one({"uid": uid})
    if not doc or "balance" not in doc:
        return {
            "cash": 0.0,
            "stocks": {},
            "crypto": {},
            "forex": {}
        }
    return doc["balance"]