from cloudinary.utils import cloudinary_url
import time

def get_signed_url(public_id, expiry_seconds=300):
    if not public_id or not isinstance(public_id, str):
        return None

    # Guess resource type based on extension
    extension = public_id.split('.')[-1].lower() if '.' in public_id else ''
    if extension in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']:
        resource_type = 'image'
    elif extension in ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'csv', 'ppt', 'pptx']:
        resource_type = 'raw'
    else:
        resource_type = 'auto'

    try:
        expiry_seconds = int(expiry_seconds)
    except ValueError:
        expiry_seconds = 300

    signed_url, _ = cloudinary_url(
        public_id,
        resource_type=resource_type,
        type="private",
        sign_url=True,
        expires_at=int(time.time()) + expiry_seconds
    )
    return signed_url
