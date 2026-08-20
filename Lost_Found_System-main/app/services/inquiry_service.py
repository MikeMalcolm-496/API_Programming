import uuid
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.inquiry import Inquiry
from app.models.user import User
from app.services.found_item_service import get_found_item_by_id
from app.schemas.inquiry_schemas import InquiryCreateRequest, InquiryStatusUpdateRequest


def create_inquiry(item_id: str, request: InquiryCreateRequest, current_user: User, db: Session) -> Inquiry:
    """
    Business logic for a student submitting a claim on a found item.

    Rules enforced here:
    1. The found item must actually exist (reuses the 404 check from found_item_service)
    2. The inquiry is always linked to whoever is submitting it (current_user)
    3. Status always starts as "pending" — only security can move it forward
    """
    # This raises a 404 automatically if the item doesn't exist —
    # we don't want students submitting claims on items that aren't real
    get_found_item_by_id(item_id, db)

    new_inquiry = Inquiry(
        id=uuid.uuid4(),
        found_item_id=item_id,
        claimant_user_id=current_user.id,
        status="pending",
        claim_description=request.claim_description,
    )

    db.add(new_inquiry)
    db.commit()
    db.refresh(new_inquiry)

    return new_inquiry


def list_inquiries_for_item(item_id: str, db: Session) -> list[Inquiry]:
    """
    Business logic for security viewing all claims submitted on a specific item.
    """
    # Confirm the item exists before listing its inquiries
    get_found_item_by_id(item_id, db)

    return (
        db.query(Inquiry)
        .filter(Inquiry.found_item_id == item_id)
        .order_by(Inquiry.created_at.desc())
        .all()
    )


def list_my_inquiries(current_user: User, db: Session) -> list[Inquiry]:
    """
    Business logic for a student viewing only their own submitted claims.
    """
    return (
        db.query(Inquiry)
        .filter(Inquiry.claimant_user_id == current_user.id)
        .order_by(Inquiry.created_at.desc())
        .all()
    )


def get_inquiry_by_id(inquiry_id: str, db: Session) -> Inquiry:
    """
    Fetch a single inquiry, raising 404 if it doesn't exist.
    Reused by both the status-update route and the messages module later.
    """
    inquiry = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()

    if not inquiry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inquiry not found"
        )

    return inquiry


def update_inquiry_status(inquiry_id: str, request: InquiryStatusUpdateRequest, db: Session) -> Inquiry:
    """
    Business logic for security approving or rejecting a claim.
    """
    inquiry = get_inquiry_by_id(inquiry_id, db)

    inquiry.status = request.status
    db.commit()
    db.refresh(inquiry)

    return inquiry