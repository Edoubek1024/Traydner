from fastapi import APIRouter, Depends, HTTPException
from app.core.auth_dependencies import get_current_user_from_api_key

router = APIRouter(prefix="/api/remote", tags=["Remote"])

@router.post("/trade")
async def execute_trade(
    symbol: str,
    side: str,
    quantity: float,
    user = Depends(get_current_user_from_api_key)
):
    """
    Execute a trade using an API key linked to the user's account.
    """
    # Example placeholder — you can integrate your trade logic here
    if side not in ["buy", "sell"]:
        raise HTTPException(status_code=400, detail="Side must be 'buy' or 'sell'")

    # You can now access user info:
    # user["_id"], user["email"], etc.
    # Perform your trade logic
    trade_result = {
        "symbol": symbol,
        "side": side,
        "quantity": quantity,
        "executed_by": user["email"]
    }

    return {"status": "success", "trade": trade_result}
