from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_security_staff, require_student
from app.schemas.inquiry_schemas import (
    InquiryCreateRequest,
    InquiryStatusUpdateRequest,
    InquiryResponse,
)
from app.services.inquiry_service import (
    create_inquiry,
    list_inquiries_for_item,
    list_my_inquiries,
    update_inquiry_status,
)
from app.models.user import User

router = APIRouter(tags=["Inquiries"])


@router.post("/found-items/{item_id}/inquiries", response_model=InquiryResponse, status_code=201)
def post_inquiry(
    item_id: str,
    request: InquiryCreateRequest,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Submit a claim on a found item. Students only.

    POST /found-items/{item_id}/inquiries
    Headers: Authorization: Bearer <token>
    Body: { claim_description }
    """
    inquiry = create_inquiry(item_id, request, current_user, db)
    return inquiry


@router.get("/found-items/{item_id}/inquiries", response_model=list[InquiryResponse])
def get_inquiries_for_item(
    item_id: str,
    current_user: User = Depends(require_security_staff),
    db: Session = Depends(get_db),
):
    """
    List all claims submitted on a specific item. Security/admin only.

    GET /found-items/{item_id}/inquiries
    Headers: Authorization: Bearer <token>
    """
    inquiries = list_inquiries_for_item(item_id, db)
    return inquiries


@router.get("/inquiries/my", response_model=list[InquiryResponse])
def get_my_inquiries(
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    List the current student's own submitted claims. Students only.

    GET /inquiries/my
    Headers: Authorization: Bearer <token>
    """
    inquiries = list_my_inquiries(current_user, db)
    return inquiries


@router.patch("/inquiries/{inquiry_id}/status", response_model=InquiryResponse)
def patch_inquiry_status(
    inquiry_id: str,
    request: InquiryStatusUpdateRequest,
    current_user: User = Depends(require_security_staff),
    db: Session = Depends(get_db),
):
    """
    Approve or reject a claim. Security/admin only.

    PATCH /inquiries/{inquiry_id}/status
    Headers: Authorization: Bearer <token>
    Body: { status: "approved" | "rejected" }
    """
    inquiry = update_inquiry_status(inquiry_id, request, db)
    return inquiry