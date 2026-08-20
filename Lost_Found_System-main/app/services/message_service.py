import uuid
from sqlalchemy.orm import Session
from app.models.message import InquiryMessage
from app.models.user import User
from app.services.inquiry_service import get_inquiry_by_id
from app.schemas.message_schemas import MessageCreateRequest


def create_message(inquiry_id: str, request: MessageCreateRequest, current_user: User, db: Session) -> InquiryMessage:
    """
    Business logic for posting a message in an inquiry thread.

    Rules enforced here:
    1. The inquiry must actually exist (reuses the 404 check from inquiry_service)
    2. The message is always linked to whoever sent it (current_user) —
       could be the student or the security staff handling the claim
    """
    # Raises 404 automatically if the inquiry doesn't exist
    get_inquiry_by_id(inquiry_id, db)

    new_message = InquiryMessage(
        id=uuid.uuid4(),
        inquiry_id=inquiry_id,
        sender_user_id=current_user.id,
        message=request.message,
    )

    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    return new_message


def list_messages_for_inquiry(inquiry_id: str, db: Session) -> list[InquiryMessage]:
    """
    Business logic for reading the full message thread of an inquiry.
    Ordered oldest-first so it reads top-to-bottom like a real chat.
    """
    # Confirm the inquiry exists before listing its messages
    get_inquiry_by_id(inquiry_id, db)

    return (
        db.query(InquiryMessage)
        .filter(InquiryMessage.inquiry_id == inquiry_id)
        .order_by(InquiryMessage.sent_at.asc())
        .all()
    )