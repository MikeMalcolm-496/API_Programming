from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_security_staff
from app.schemas.image_schemas import ImageResponse
from app.services.image_service import upload_image_for_item, list_images_for_item
from app.models.user import User

router = APIRouter(tags=["Images"])


@router.post("/found-items/{item_id}/images", response_model=ImageResponse, status_code=201)
def post_image(
    item_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_security_staff),
    db: Session = Depends(get_db),
):
    """
    Upload an image for a found item. Security/admin only.

    POST /found-items/{item_id}/images
    Headers: Authorization: Bearer <token>
    Body: multipart/form-data with a "file" field containing the image
    """
    image = upload_image_for_item(item_id, file, db)
    return image


@router.get("/found-items/{item_id}/images", response_model=list[ImageResponse])
def get_images(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List all images for a found item. Any logged-in user.

    GET /found-items/{item_id}/images
    Headers: Authorization: Bearer <token>
    """
    images = list_images_for_item(item_id, db)
    return images