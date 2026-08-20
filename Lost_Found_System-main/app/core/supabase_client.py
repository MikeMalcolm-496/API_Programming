from supabase import create_client, Client
from app.core.config import settings

# This client is used ONLY for Storage operations (uploading images).
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

BUCKET_NAME = "found-items"
