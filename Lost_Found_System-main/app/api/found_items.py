from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_security_staff
from app.schemas.found_item_schemas import (
    FoundItemCreateRequest,
    FoundItemStatusUpdateRequest,
    FoundItemResponse,
)
from app.services.found_item_service import (
    create_found_item,
    list_found_items,
    get_found_item_by_id,
    update_found_item_status,
)
from app.models.user import User

router = APIRouter(prefix="/found-items", tags=["Found Items"])


@router.post("", response_model=FoundItemResponse, status_code=201)
def post_found_item(
    request: FoundItemCreateRequest,
    current_user: User = Depends(require_security_staff),
    db: Session = Depends(get_db),
):
    """
    Post a new found item. Security/admin only.

    POST /found-items
    Headers: Authorization: Bearer <token>
    Body: { title, description, category, location_found, date_found }
    """
    item = create_found_item(request, current_user, db)
    return item


@router.get("", response_model=list[FoundItemResponse])
def get_found_items(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List all found items. Any logged-in user (student or security).

    GET /found-items
    Headers: Authorization: Bearer <token>
    """
    items = list_found_items(db)
    return items


@router.get("/{item_id}", response_model=FoundItemResponse)
def get_found_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get details of a single found item. Any logged-in user.

    GET /found-items/{item_id}
    Headers: Authorization: Bearer <token>
    """
    item = get_found_item_by_id(item_id, db)
    return item


@router.patch("/{item_id}/status", response_model=FoundItemResponse)
def patch_found_item_status(
    item_id: str,
    request: FoundItemStatusUpdateRequest,
    current_user: User = Depends(require_security_staff),
    db: Session = Depends(get_db),
):
    """
    Update a found item's status. Security/admin only.

    PATCH /found-items/{item_id}/status
    Headers: Authorization: Bearer <token>
    Body: { status: "unclaimed" | "under_review" | "claimed" | "closed" }
    """
    item = update_found_item_status(item_id, request, db)
    return item
