import uuid
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from app.models.image import FoundItemImage
from app.core.supabase_client import supabase, BUCKET_NAME
from app.services.found_item_service import get_found_item_by_id


def upload_image_for_item(item_id: str, file: UploadFile, db: Session) -> FoundItemImage:
   
    # Raises 404 automatically if the item doesn't exist
    get_found_item_by_id(item_id, db)

    # Build a unique storage path so multiple images for the same item
   
    file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    storage_key = f"{item_id}/{uuid.uuid4()}.{file_extension}"

    # Read the actual file bytes from the upload
    file_bytes = file.file.read()

    # Upload to Supabase Storage
    try:
        supabase.storage.from_(BUCKET_NAME).upload(
            path=storage_key,
            file=file_bytes,
            file_options={"content-type": file.content_type},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Image upload failed: {str(e)}"
        )

    # Get the public URL for the uploaded file
    public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(storage_key)

    # Save the record in our database
    new_image = FoundItemImage(
        id=uuid.uuid4(),
        found_item_id=item_id,
        storage_key=storage_key,
        url=public_url,
        is_primary=False,
    )

    db.add(new_image)
    db.commit()
    db.refresh(new_image)

    return new_image


def list_images_for_item(item_id: str, db: Session) -> list[FoundItemImage]:
    """
    Business logic for listing all images attached to a found item.
    """
    get_found_item_by_id(item_id, db)

    return (
        db.query(FoundItemImage)
        .filter(FoundItemImage.found_item_id == item_id)
        .all()
    )
