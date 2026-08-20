import uuid
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.found_items import FoundItem
from app.models.user import User
from app.schemas.found_item_schemas import FoundItemCreateRequest, FoundItemStatusUpdateRequest


def create_found_item(request: FoundItemCreateRequest, current_user: User, db: Session) -> FoundItem:
    """
    Business logic for security staff posting a new found item.

    Rules enforced here:
    1. The item is always linked to whoever posted it (current_user)
    2. Status always starts as "unclaimed" — nobody sets this manually on creation
    """
    new_item = FoundItem(
        id=uuid.uuid4(),
        posted_by_user_id=current_user.id,
        title=request.title,
        description=request.description,
        category=request.category,
        location_found=request.location_found,
        date_found=request.date_found,
        status="unclaimed",
    )

    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return new_item


def list_found_items(db: Session) -> list[FoundItem]:
    """
    Business logic for listing all found items.
    Kept deliberately simple for now — no filters, most recent first.
    """
    return db.query(FoundItem).order_by(FoundItem.created_at.desc()).all()


def get_found_item_by_id(item_id: str, db: Session) -> FoundItem:
    """
    Business logic for fetching a single found item.
    Raises 404 if it doesn't exist — every route that needs "does this item
    exist" reuses this function instead of repeating the check.
    """
    item = db.query(FoundItem).filter(FoundItem.id == item_id).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Found item not found"
        )

    return item


def update_found_item_status(item_id: str, request: FoundItemStatusUpdateRequest, db: Session) -> FoundItem:
    """
    Business logic for security staff updating an item's status.
    Reuses get_found_item_by_id so the 404 check isn't duplicated.
    """
    item = get_found_item_by_id(item_id, db)

    item.status = request.status
    db.commit()
    db.refresh(item)

    return item
