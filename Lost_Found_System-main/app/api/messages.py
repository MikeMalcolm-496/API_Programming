from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.schemas.message_schemas import MessageCreateRequest, MessageResponse
from app.services.message_service import create_message, list_messages_for_inquiry
from app.models.user import User

router = APIRouter(tags=["Messages"])


@router.post("/inquiries/{inquiry_id}/messages", response_model=MessageResponse, status_code=201)
def post_message(
    inquiry_id: str,
    request: MessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a message in an inquiry thread. Any logged-in user (student or security).

    POST /inquiries/{inquiry_id}/messages
    Headers: Authorization: Bearer <token>
    Body: { message }
    """
    message = create_message(inquiry_id, request, current_user, db)
    return message


@router.get("/inquiries/{inquiry_id}/messages", response_model=list[MessageResponse])
def get_messages(
    inquiry_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get the full message thread for an inquiry. Any logged-in user.

    GET /inquiries/{inquiry_id}/messages
    Headers: Authorization: Bearer <token>
    """
    messages = list_messages_for_inquiry(inquiry_id, db)
    return messages