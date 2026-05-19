from flask import Blueprint, request, jsonify, session, current_app, Response
from DAL.product_dal import *
import os
import json
import logging
import requests
from werkzeug.utils import secure_filename
from DAL.cloudinary_utils import upload_image_to_cloudinary
import traceback
import re

# Thiết lập logging
logger = logging.getLogger(__name__)

product_blueprint = Blueprint('product', __name__)

def convert_cloudinary_url_to_proxy(url):
    """
    Use Cloudinary URL as is or convert if needed.
    
    Args:
        url (str): Cloudinary URL
        
    Returns:
        str: Original URL or transformed URL
    """
    try:
        if not url or not isinstance(url, str):
            return url
            
        # For now, we're just returning the Cloudinary URL as is
        # as Cloudinary already provides CDN capabilities
        return url
    except:
        # Nếu có lỗi xử lý, trả lại URL gốc
        return url

def convert_image_urls_in_product(product):
    """
    Chuyển đổi tất cả URL ảnh trong một sản phẩm thành proxy URL.
    
    Args:
        product (dict): Thông tin sản phẩm
    
    Returns:
        dict: Sản phẩm với URL ảnh đã được cập nhật
    """
    if not product:
        return product
        
    # Xử lý trường hợp là một danh sách sản phẩm
    if isinstance(product, list):
        for item in product:
            convert_image_urls_in_product(item)
        return product
        
    # Xử lý trường image, image_url, thumbnail
    for field in ['image', 'image_url', 'thumbnail']:
        if field in product and product[field]:
            # Trường hợp multiple images được phân tách bằng dấu ";"
            if ';' in product[field]:
                urls = product[field].split(';')
                converted_urls = [convert_cloudinary_url_to_proxy(url.strip()) for url in urls]
                product[field] = '; '.join(converted_urls)
            else:
                product[field] = convert_cloudinary_url_to_proxy(product[field])
    
    # Xử lý trường images nếu là một list
    if 'images' in product and isinstance(product['images'], list):
        product['images'] = [convert_cloudinary_url_to_proxy(url) for url in product['images']]
        
    # Đệ quy xử lý các trường nested
    for key, value in product.items():
        if isinstance(value, dict):
            convert_image_urls_in_product(value)
        elif isinstance(value, list) and len(value) > 0 and isinstance(value[0], dict):
            for item in value:
                convert_image_urls_in_product(item)
                
    return product

@product_blueprint.route("/products", methods=["GET"])
def get_all_products():
    try:
        products, status = dal_get_all_products()
        if status == 200:
            # Wrap in 'products' object to match what frontend expects
            return jsonify({"products": products}), 200
        else:
            return jsonify(products), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@product_blueprint.route("/filters", methods=["GET"])
def get_filters():
    try:
        filters = dal_get_filters()
        return jsonify(filters)
    except Exception as e:
        print("Error fetching filters:", e)
        return jsonify({"error": "Internal Server Error"}), 500

@product_blueprint.route("/product-images/<int:product_id>", methods=["GET"])
def get_product_images(product_id):
    try:
        image_urls = dal_get_product_images(product_id)
        return jsonify(image_urls)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route('/laptops', methods=['GET'])
def get_laptops():
    try:
        laptops = dal_get_laptops()
        return jsonify(laptops)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/getallproduct", methods=["GET"])
def get_all_product():
    try:
        products = get_products_from_db_by_query()
        return jsonify(products), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@product_blueprint.route("/components/<int:product_id>", methods=["GET"])
def get_component_by_id(product_id):
    try:
        component, status = dal_get_component_by_id(product_id)
        if status == 200:
            return jsonify(component), 200
        else:
            return jsonify(component), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/components/batch", methods=["GET", "POST"])
def get_components_by_ids():
    try:
        product_ids = []
        if request.method == "GET":
            ids_param = request.args.get('ids')
            if not ids_param:
                return jsonify({"error": "No product IDs provided. Use ?ids=1,2,3"}), 400
            try:
                product_ids = [int(id.strip()) for id in ids_param.split(',') if id.strip()]
            except ValueError:
                return jsonify({"error": "Invalid ID format, must be comma-separated integers"}), 400
        else: # POST
            data = request.get_json()
            if not data or 'ids' not in data:
                return jsonify({"error": "No product IDs provided in request body"}), 400
            product_ids = data.get('ids', [])
            if not isinstance(product_ids, list):
                return jsonify({"error": "Product IDs must be a list"}), 400
            try:
                product_ids = [int(id) for id in product_ids]
            except ValueError:
                return jsonify({"error": "All product IDs must be integers"}), 400
                
        if not product_ids:
            return jsonify([]), 200
            
        components, status = dal_get_components_by_ids(product_ids)
        if status == 200:
            return jsonify(components), 200
        else:
            return jsonify(components), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@product_blueprint.route("/components/<string:type>", methods=["GET"])
def get_components_by_type(type):
    try:
        print(f"Received request for components of type: {type}")
        
        components, status = dal_get_components_by_type(type)
        
        if status == 200:
            return jsonify(components), 200
        else:
            return jsonify(components), status
    except Exception as e:
        import traceback
        print(f"Error in get_components_by_type: {e}")
        print(traceback.format_exc())
        return jsonify({"error": f"An error occurred while processing your request: {str(e)}"}), 500



# ---------- Generic Compatibility Endpoint ----------
@product_blueprint.route("/compatible/<string:component_type>", methods=["GET"])
def get_compatible_components(component_type):
    """
    Generic API endpoint for fetching compatible components.
    
    Args:
        component_type (str): One of 'cpu', 'cpu_cooler', 'mainboard', 'ram', 'case', 'psu', 'storage', 'gpu'
    
    Query Parameters:
        Supports any filter defined in COMPATIBILITY_RULES (e.g., cpu_socket, memory_type, form_factor, max_gpu_length)
        filter (str): Legacy filter value
    
    Returns:
        JSON response with compatible components or error message.
    """
    try:
        filters = request.args.to_dict()
        legacy_filter = filters.pop('filter', None)
        components, status = dal_get_compatible_components(component_type, filters=filters, legacy_filter=legacy_filter)
        return jsonify(components), status
    except Exception as e:
        print(f"Error in get_compatible_components ({component_type}): {e}")
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/product/<int:product_id>", methods=["DELETE"])
def delete_product(product_id):
    """
    API endpoint to delete a product by ID
    
    Args:
        product_id (int): The ID of the product to delete
        
    Returns:
        JSON response with success or error message
    """
    try:
        result, status = dal_delete_product(product_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/product/<int:product_id>", methods=["GET"])
def get_product_by_id(product_id):
    try:
        product, status = dal_get_product_by_id(product_id)
        if status == 200:
            # Trả về trực tiếp vì URL đã là URL hình ảnh đầy đủ
            return jsonify(product), 200
        else:
            return jsonify({"error": "Product not found"}), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/category/<int:category_id>/products", methods=["GET"])
def get_products_by_category(category_id):
    try:
        products, status = dal_get_products_by_category(category_id)
        return jsonify(products), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@product_blueprint.route("/featured-categories", methods=["GET"])
def get_products_from_different_categories():
    try:
        products, status = dal_get_products_from_different_categories()
        return jsonify(products), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/product-categories", methods=["GET"])
def get_product_categories():
    """
    API endpoint to get all available product categories.
    
    Returns:
        JSON response with categories or error message.
    """
    try:
        categories, status = dal_get_product_categories()
        return jsonify(categories), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/product-schema/<string:category_name>", methods=["GET"])
def get_product_schema(category_name):
    """
    API endpoint to get schema for a specific product category.
    
    Args:
        category_name (str): The name of the product category
        
    Returns:
        JSON response with schema fields or error message.
    """
    try:
        schema, status = dal_get_product_schema(category_name)
        return jsonify(schema), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/products", methods=["POST"])
def add_product():
    """
    API endpoint to add a new product.
    
    Request JSON should contain:
      - category_name: The product category name
      - common_fields: Fields for the products table
      - specific_fields: Fields for the category-specific table
      - attributes: Additional product attributes (optional)
    
    Returns:
        JSON response with success message or error.
    """
    try:
        # Extract form data
        product_data = {}
          # Get category details - prefer ID if available, otherwise use name
        category_id = request.form.get('category_id')
        category_name = request.form.get('category_name')
        
        if category_id:
            product_data['category_id'] = category_id
        elif category_name:
            product_data['category_name'] = category_name
        else:
            return jsonify({"error": "Category ID or name is required"}), 400
        
        # Extract common fields
        common_fields = {}
        for key in request.form:
            if key.startswith('common_'):
                field_name = key.replace('common_', '')
                common_fields[field_name] = request.form.get(key)
                
        # Handle Cloudinary uploaded image URLs (if present)
        if 'cloudinary_image_url' in request.form:
            cloudinary_url = request.form.get('cloudinary_image_url')
            if cloudinary_url:
                if 'image' in common_fields:
                    # If we already have images, append this one
                    common_fields['image'] = common_fields['image'] + '; ' + cloudinary_url
                else:
                    # Otherwise create a new field
                    common_fields['image'] = cloudinary_url
                logger.info(f"Using Cloudinary image URL: {cloudinary_url}")
                
        # Handle traditional file uploads (for backwards compatibility)
        image_urls = []
        if 'images' in request.files:
            image_files = request.files.getlist('images')
            logger.info(f"Processing {len(image_files)} images")
            
            for image in image_files:
                if image and image.filename:
                    try:
                        # Generate a unique filename to prevent overwriting
                        from datetime import datetime
                        import traceback
                        
                        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                        original_filename = image.filename
                        filename = f"{timestamp}_{secure_filename(original_filename)}"
                        
                        logger.info(f"Processing image: {original_filename}, content type: {image.content_type}, size: {image.content_length if hasattr(image, 'content_length') else 'unknown'}")
                        
                        # Phương thức 1: Tải trực tiếp từ file object (không cần lưu vào thư mục tạm)
                        logger.info(f"Uploading image {filename} to Cloudinary...")
                        
                        # Đảm bảo file pointer ở vị trí đầu
                        image.stream.seek(0)
                        
                        image_url = upload_image_to_cloudinary(filename, file_object=image)
                        
                        # Add the URL to our list if it was successfully created
                        if image_url:
                            logger.info(f"Successfully uploaded image: {image_url}")
                            image_urls.append(image_url)
                        else:
                            # Phương thức 2: Nếu tải trực tiếp thất bại, thử phương thức lưu tạm và tải lên
                            logger.warning(f"Direct upload failed, trying with temp file for {filename}")
                            
                            # Create temp directory if it doesn't exist
                            temp_folder = current_app.config.get('UPLOAD_FOLDER', os.path.join(
                                os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'temp_uploads'))
                            os.makedirs(temp_folder, exist_ok=True)
                            
                            # Reset file pointer
                            image.stream.seek(0)
                            
                            # Save to temp path
                            temp_path = os.path.join(temp_folder, filename)
                            image.save(temp_path)
                            
                            # Log file info
                            if os.path.exists(temp_path):
                                logger.info(f"Saved temp file: {temp_path}, size: {os.path.getsize(temp_path)} bytes")
                            else:
                                logger.error(f"Failed to save temp file: {temp_path}")
                            
                            try:
                                # Upload from temp file
                                image_url = upload_image_to_cloudinary(temp_path)
                                if image_url:
                                    logger.info(f"Successfully uploaded image from temp file: {image_url}")
                                    image_urls.append(image_url)
                                else:
                                    logger.error(f"Failed to upload image {filename} to Cloudinary")
                            finally:
                                # Clean up temp file
                                if os.path.exists(temp_path):
                                    try:
                                        os.remove(temp_path)
                                        logger.info(f"Removed temporary file: {temp_path}")
                                    except Exception as clean_err:
                                        logger.error(f"Failed to remove temporary file: {clean_err}")
                    except Exception as e:
                        logger.error(f"Error processing image {image.filename}: {str(e)}")
        # Nếu có ảnh thì mới thêm vào common_fields
        if image_urls:
            common_fields['image'] = "; ".join(image_urls)
        
        product_data['common_fields'] = common_fields
          # Extract specific fields
        specific_fields = {}
        # First check if specific_fields was sent as JSON string
        if 'specific_fields' in request.form:
            try:
                specific_fields = json.loads(request.form.get('specific_fields'))
            except json.JSONDecodeError:
                pass
                
        # Also check for individual specific_ fields
        for key in request.form:
            if key.startswith('specific_') and key != 'specific_fields':
                field_name = key.replace('specific_', '')
                specific_fields[field_name] = request.form.get(key)
        
        product_data['specific_fields'] = specific_fields
        
        # Extract attributes
        attributes = {}
        # First check if attributes was sent as JSON string
        if 'attributes' in request.form:
            try:
                attributes = json.loads(request.form.get('attributes'))
            except json.JSONDecodeError:
                pass
                
        # Also check for individual attr_ fields
        for key in request.form:
            if key.startswith('attr_'):
                attr_name = key.replace('attr_', '')
                attributes[attr_name] = request.form.get(key)
        
        product_data['attributes'] = attributes
        
        # Add the product
        result, status = dal_add_product(product_data)
        
        return jsonify(result), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/check-static", methods=["GET"])
def check_static_folder():
    """
    API endpoint to check if static folder is properly configured.
    For debugging purposes.
    """
    try:
        # Get the static folder path
        static_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static')
        uploads_path = os.path.join(static_path, 'uploads')
        
        # Check if directories exist
        static_exists = os.path.exists(static_path)
        uploads_exists = os.path.exists(uploads_path)
        
        # Check permissions (try to write a test file)
        permission_ok = False
        try:
            test_file_path = os.path.join(uploads_path, 'test_write.txt')
            with open(test_file_path, 'w') as f:
                f.write('Test write access')
            os.remove(test_file_path)
            permission_ok = True
        except Exception as e:
            permission_ok = str(e)
        
        # Get list of files in uploads folder
        files = []
        if uploads_exists:
            files = os.listdir(uploads_path)
        
        # Result
        result = {
            'static_exists': static_exists,
            'static_path': static_path,
            'uploads_exists': uploads_exists,
            'uploads_path': uploads_path,
            'permission_ok': permission_ok,
            'files': files,
            'app_instance_path': current_app.instance_path,
            'app_root_path': current_app.root_path,
            'app_static_folder': current_app.static_folder,
            'app_static_url_path': current_app.static_url_path
        }
        
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/test-static-file/<path:filename>", methods=["GET"])
def test_static_file(filename):
    """
    Test if a static file exists and is accessible.
    """
    try:
        # Get the static folder path
        static_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static')
        file_path = os.path.join(static_path, filename)
        
        if os.path.exists(file_path):
            # Return file metadata
            file_stats = os.stat(file_path)
            file_size = file_stats.st_size
            
            return jsonify({
                "exists": True,
                "file_path": file_path,
                "size": file_size,
                "url": f"/static/{filename}",
                "is_readable": os.access(file_path, os.R_OK)
            }), 200
        else:
            return jsonify({
                "exists": False,
                "file_path": file_path
            }), 404
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@product_blueprint.route("/product/<int:product_id>", methods=["PUT"])
def update_product(product_id):
    """
    API endpoint to update an existing product by ID.
    
    Args:
        product_id (int): The ID of the product to update
        
    Request:
        multipart/form-data with:
        - category_name: The product category name (optional)
        - common_fields: Fields for the products table
        - specific_fields: Fields for the category-specific table (optional)
        - attributes: Additional product attributes (optional)
        - images: Product images (optional)
        
    Returns:
        JSON response with success message or error.
    """
    try:
        # Extract form data
        product_data = {}
        
        # Get category name if provided
        category_name = request.form.get('category_name')
        if category_name:
            product_data['category_name'] = category_name
        
        # Extract common fields
        common_fields = {}
        for key in request.form:
            if key.startswith('common_'):
                field_name = key.replace('common_', '')
                common_fields[field_name] = request.form.get(key)
        
        # Handle Cloudinary uploaded image URLs (if present)
        if 'cloudinary_image_url' in request.form:
            cloudinary_url = request.form.get('cloudinary_image_url')
            if cloudinary_url:
                if 'image' in common_fields:
                    # If we already have images, append this one
                    common_fields['image'] = common_fields['image'] + '; ' + cloudinary_url
                else:
                    # Otherwise create a new field
                    common_fields['image'] = cloudinary_url
                logger.info(f"Using Cloudinary image URL: {cloudinary_url}")
        
        # Handle traditional file uploads (for backwards compatibility)
        image_urls = []
        if 'images' in request.files:
            image_files = request.files.getlist('images')
            logger.info(f"Processing {len(image_files)} images for product update")
            
            for image in image_files:
                if image and image.filename:
                    try:
                        # Generate a unique filename to prevent overwriting
                        from datetime import datetime
                        
                        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                        original_filename = image.filename
                        filename = f"{timestamp}_{secure_filename(original_filename)}"
                        
                        logger.info(f"Processing image: {original_filename}")
                        
                        # Upload to Cloudinary
                        image.stream.seek(0)
                        image_url = upload_image_to_cloudinary(filename, file_object=image)
                        
                        # Add the URL to our list if it was successfully created
                        if image_url:
                            logger.info(f"Successfully uploaded image: {image_url}")
                            image_urls.append(image_url)
                        else:
                            logger.error(f"Failed to upload image {filename}")
                    except Exception as e:
                        logger.error(f"Error processing image {image.filename}: {str(e)}")
        
        # Add image URLs to common_fields if new images were uploaded
        if image_urls:
            common_fields['image'] = "; ".join(image_urls)
        
        product_data['common_fields'] = common_fields
        
        # Extract specific fields
        specific_fields = {}
        # First check if specific_fields was sent as JSON string
        if 'specific_fields' in request.form:
            try:
                specific_fields = json.loads(request.form.get('specific_fields'))
            except json.JSONDecodeError:
                pass
                
        # Also check for individual specific_ fields
        for key in request.form:
            if key.startswith('specific_') and key != 'specific_fields':
                field_name = key.replace('specific_', '')
                specific_fields[field_name] = request.form.get(key)
        
        product_data['specific_fields'] = specific_fields
        
        # Extract attributes
        attributes = {}
        # First check if attributes was sent as JSON string
        if 'attributes' in request.form:
            try:
                attributes = json.loads(request.form.get('attributes'))
            except json.JSONDecodeError:
                pass
                
        # Also check for individual attr_ fields
        for key in request.form:
            if key.startswith('attr_'):
                attr_name = key.replace('attr_', '')
                attributes[attr_name] = request.form.get(key)
        
        product_data['attributes'] = attributes
        
        # Update the product
        result, status = dal_update_product(product_id, product_data)
        
        return jsonify(result), status
    except Exception as e:
        logger.error(f"Error updating product: {str(e)}")
        return jsonify({"error": str(e)}), 500
