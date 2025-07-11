from fastapi import APIRouter, Depends
from middleware.firebase_auth import firebase_user
from .users import create_or_update_user, get_user

router = APIRouter(prefix="/api/users", tags=["Users"])

@router.get("/me")
async def get_my_profile(user=Depends(firebase_user)):
    return get_user(user['uid'])

@router.post("/update")
async def update_my_profile(update_data: dict, user=Depends(firebase_user)):
    create_or_update_user(user['uid'], update_data)
    return {"message": "User updated"}
