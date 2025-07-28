from pydantic import BaseModel, Field
from typing import Dict, Optional
from datetime import datetime

class Balance(BaseModel):
    cash: float = 0.0
    stocks: Dict[str, float] = Field(default_factory=dict)
    crypto: Dict[str, float] = Field(default_factory=dict)

class UserModel(BaseModel):
    uid: str
    email: Optional[str] = None
    displayName: Optional[str] = None
    balance: Balance = Field(default_factory=Balance)
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None
