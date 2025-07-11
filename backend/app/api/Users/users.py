from firebase_admin import firestore

def create_or_update_user(uid: str, data: dict):
    db = firestore.client()
    user_ref = db.collection("users").document(uid)
    user_ref.set(data, merge=True)
    return True

def get_user(uid: str):
    db = firestore.client()
    doc = db.collection("users").document(uid).get()
    return doc.to_dict() if doc.exists else None
