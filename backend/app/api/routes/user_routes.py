from fastapi import APIRouter, Depends, HTTPException
from ...firebase.firebase_auth import firebase_user
from ...services.user_service import create_or_update_user, get_user

router = APIRouter(prefix="/api/users", tags=["Users"])

@router.get("/me")
async def get_my_profile(user=Depends(firebase_user)):
    return get_user(user['uid'])

@router.post("/update")
async def update_my_profile(update_data: dict, user=Depends(firebase_user)):
    result = create_or_update_user(user['uid'], update_data)

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))

    return { "message": "User updated" }