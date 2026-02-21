from fastapi import APIRouter, HTTPException, status

router = APIRouter()


@router.get("")
async def chat_status():
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Chat API is scaffolded but not implemented yet.",
    )
