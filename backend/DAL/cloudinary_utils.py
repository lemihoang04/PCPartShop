import cloudinary
import cloudinary.uploader
import cloudinary.api
import logging

# Configure Cloudinary
cloudinary.config(
    cloud_name="ddptatoir3",
    api_key="165159972684744",
    api_secret="T7bkP2pH_hFTXPeZK-21jJnIFjE"
)

# Setup logging
logger = logging.getLogger(__name__)

def upload_image_to_cloudinary(image_file, file_object=None, folder="product_images"):
    """
    Upload an image to Cloudinary
    
    Args:
        image_file: The image file name or path
        file_object: Optional file object to upload directly (instead of from path)
        folder: The folder in Cloudinary where the image will be stored (default: "product_images")
        
    Returns:
        dict: Dictionary containing image info including URL or None if upload fails
    """
    try:
        if not image_file and not file_object:
            logger.error("No image file provided")
            return None
            
        # Upload to Cloudinary - use file_object if provided, otherwise use image_file path
        upload_params = {
            "folder": folder,
            "upload_preset": "my_preset"
        }
        
        if file_object:
            # If file_object is provided, upload directly
            result = cloudinary.uploader.upload(file_object, **upload_params)
        else:
            # Otherwise, upload from the file path
            result = cloudinary.uploader.upload(image_file, **upload_params)
        
        logger.info(f"Successfully uploaded image to Cloudinary: {result['public_id']}")
        
        # Return important information
        return {
            'secure_url': result['secure_url'],  # HTTPS URL
            'public_id': result['public_id'],    # Cloudinary public ID
            'url': result['url'],                # HTTP URL
            'format': result['format'],          # Image format
            'width': result['width'],            # Image width
            'height': result['height']           # Image height
        }
        
    except Exception as e:
        logger.error(f"Error uploading to Cloudinary: {str(e)}")
        return None

def delete_image_from_cloudinary(public_id):
    """
    Delete an image from Cloudinary
    
    Args:
        public_id: The public ID of the image to delete
        
    Returns:
        bool: True if deletion was successful, False otherwise
    """
    try:
        if not public_id:
            logger.error("No public_id provided for deletion")
            return False
            
        # Delete from Cloudinary
        result = cloudinary.uploader.destroy(public_id)
        
        if result.get('result') == 'ok':
            logger.info(f"Successfully deleted image from Cloudinary: {public_id}")
            return True
        else:
            logger.error(f"Failed to delete image from Cloudinary: {public_id}")
            return False
            
    except Exception as e:
        logger.error(f"Error deleting from Cloudinary: {str(e)}")
        return False

def create_thumbnail_url(url, width=200, height=200, crop="fill"):
    """
    Create a thumbnail URL from a Cloudinary URL
    
    Args:
        url: The original Cloudinary URL
        width: Thumbnail width
        height: Thumbnail height
        crop: Crop mode (fill, limit, thumb, etc.)
        
    Returns:
        str: URL to the generated thumbnail
    """
    try:
        if not url or not isinstance(url, str):
            return url
            
        # Check if it's a Cloudinary URL
        if 'res.cloudinary.com' not in url:
            return url
            
        # Extract the parts before and after 'upload/'
        parts = url.split('upload/')
        if len(parts) != 2:
            return url
            
        # Create a thumbnail URL by inserting transformation parameters
        thumbnail_url = f"{parts[0]}upload/w_{width},h_{height},c_{crop}/{parts[1]}"
        return thumbnail_url
        
    except Exception as e:
        logger.error(f"Error creating thumbnail URL: {str(e)}")
        return url