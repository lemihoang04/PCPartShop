from flask import Blueprint, request, jsonify, session, current_app, Response
from DAL.product_dal import *
import os
import json
import logging
import requests
from werkzeug.utils import secure_filename
from DAL.cloudinary_utils import upload_image_to_cloudinary, create_thumbnail_url
import traceback
import re

# Thiết lập logging
logger = logging.getLogger(__name__)

try:
    from DAL.component_patch import dal_get_components_by_attributes as patched_dal_get_components_by_attributes
    print("Successfully imported patched dal_get_components_by_attributes function")
except ImportError as e:
    print(f"Failed to import patched function: {e}")
    patched_dal_get_components_by_attributes = None

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
    
@product_blueprint.route("/components/<string:type>", methods=["GET"])
def get_components_by_type(type):
    try:
        print(f"Received request for components of type: {type}")
        
        # First try to get category info directly from the database
        db = get_db_connection()
        if not db:
            return jsonify({"error": "Database connection failed"}), 500
            
        cursor = db.cursor(dictionary=True)
        try:
            # Find matching category by name (case insensitive)
            cursor.execute("""
                SELECT category_id, category_name 
                FROM categories 
                WHERE LOWER(category_name) = LOWER(%s)
            """, (type,))
            
            category = cursor.fetchone()
            
            if category:
                print(f"Found matching category: {category['category_name']} (ID: {category['category_id']})")
                type_to_use = category['category_name']  # Use exact case from database
            else:
                print(f"No matching category found for '{type}', using fallback method")
                # Fallback to standard types list
                valid_types = ['Storage', 'PSU', 'Mainboard', 'GPU', 'CPU', 'RAM', 'CPU Cooler', 'Case', 'CPU_Cooler']
                standardized_type = None
                
                # Try to match against valid types in a case-insensitive way
                for valid_type in valid_types:
                    if valid_type.lower() == type.lower():
                        standardized_type = valid_type
                        print(f"Matched {type} to standardized type: {standardized_type}")
                        break
                
                # Use standardized type if found, otherwise use original
                type_to_use = standardized_type if standardized_type else type
        finally:
            cursor.close()
            db.close()
          # Kiểm tra xem có query parameters không
        if request.args:
            # Có query parameters - lọc theo thuộc tính
            attributes = {}
            for key, value in request.args.items():
                attributes[key] = value

            print(f"Filtering {type_to_use} with attributes: {attributes}")
            
            # Use patched version if available, fall back to original
            if patched_dal_get_components_by_attributes:
                print("Using patched function for component filtering")
                components, status = patched_dal_get_components_by_attributes(type_to_use, attributes)
            else:
                components, status = dal_get_components_by_attributes(type_to_use, attributes)
        else:
            # Không có query parameters - lấy tất cả components theo type
            print(f"Getting all components of type: {type_to_use}")
            try:
                # Use patched version if available, fall back to original
                if patched_dal_get_components_by_attributes:
                    print("Using patched function for component listing")
                    components, status = patched_dal_get_components_by_attributes(type_to_use)
                else:
                    components, status = dal_get_components_by_attributes(type_to_use)
            except Exception as e:
                print(f"Error in dal_get_components_by_attributes: {e}")
                # Fallback to simpler method if attribute filtering fails
                components, status = dal_get_components_by_type(type_to_use)        # Phần code sau đây sẽ chạy sau khi đã gán giá trị cho components và status
        if status == 200:
            return jsonify(components), 200
        else:
            return jsonify(components), status
    except Exception as e:
        import traceback
        print(f"Error in get_components_by_type: {e}")
        print(traceback.format_exc())
        return jsonify({"error": f"An error occurred while processing your request: {str(e)}"}), 500

@product_blueprint.route("/cpu/compatible/<string:cpu_socket>", methods=["GET"])
def get_compatible_cpus(cpu_socket):
    try:
        # Gọi hàm DAL để lấy danh sách CPU tương thích
        cpus, status = dal_CPU_vs_Mainboard(cpu_socket)

        # Trả về kết quả
        if status == 200:
            return jsonify(cpus), 200
        else:
            return jsonify(cpus), status
    except Exception as e:
        print(f"Error in get_compatible_cpus: {e}")
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/cpu-coolers/compatible/<string:cpu_socket>", methods=["GET"])
def get_compatible_cpu_coolers(cpu_socket):
    try:
        # Gọi hàm DAL để lấy danh sách CPU Cooler tương thích
        coolers, status = dal_CPU_Cooler_vs_CPU(cpu_socket)
        
        # Trả về kết quả
        if status == 200:
            return jsonify(coolers), 200
        else:
            return jsonify(coolers), status
    except Exception as e:
        print(f"Error in get_compatible_cpu_coolers: {e}")
        return jsonify({"error": str(e)}), 500
    
    
@product_blueprint.route("/mainboards/compatible/<string:cpu_socket>", methods=["GET"])
def get_compatible_mainboards(cpu_socket):
    """
    API route to get Mainboards compatible with a specific CPU socket.
    
    Args:
        cpu_socket (str): The CPU socket to match (e.g., 'AM4', 'LGA1700')
    
    Returns:
        JSON response with compatible Mainboards or error message.
    """
    print(cpu_socket)
    try:
        # Call the DAL function to get compatible mainboards
        mainboards, status = dal_Mainboard_vs_CPU(cpu_socket)
        
        # Return the result
        if status == 200:
            return jsonify(mainboards), 200
        else:
            return jsonify(mainboards), status
    except Exception as e:
        print(f"Error in get_compatible_mainboards: {e}")
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/ram/compatible/<string:memory_type>", methods=["GET"])
def get_compatible_Ram(memory_type):
    """
    API route to get Mainboards compatible with a specific CPU socket.
    
    Args:
        cpu_socket (str): The CPU socket to match (e.g., 'AM4', 'LGA1700')
    
    Returns:
        JSON response with compatible Mainboards or error message.
    """
    try:
        # Call the DAL function to get compatible mainboards
        ram, status = dal_RAM_vs_Mainboard(memory_type)
        
        # Return the result
        if status == 200:
            return jsonify(ram), 200
        else:
            return jsonify(ram), status
    except Exception as e:
        print(f"Error in get_compatible_mainboards: {e}")

@product_blueprint.route("/storage/compatible", methods=["GET"])
def get_compatible_storage():
    """
    API route to get storage devices compatible with motherboards.
    
    Returns:
        JSON response with compatible storage devices or error message.
    """
    try:
        # Call the DAL function to get compatible storage devices
        storage_devices, status = dal_Storage_vs_Mainboard()
        
        # Return the result
        if status == 200:
            return jsonify(storage_devices), 200
        else:
            return jsonify(storage_devices), status
    except Exception as e:
        print(f"Error in get_compatible_storage: {e}")
        return jsonify({"error": str(e)}), 500
    
@product_blueprint.route("/cases/compatible/<string:form_factor>", methods=["GET"])
def get_compatible_cases(form_factor):
    """
    API route to get Cases compatible with a specific Mainboard form factor.
    
    Args:
        form_factor (str): The form factor to match (e.g., 'ATX', 'Micro-ATX', 'Mini-ITX')
    
    Returns:
        JSON response with compatible cases or error message.
    """
    try:
        # Call the DAL function to get compatible cases
        cases, status = dal_Case_vs_Mainboard(form_factor)
        
        # Return the result
        if status == 200:
            return jsonify(cases), 200
        else:
            return jsonify(cases), status
    except Exception as e:
        print(f"Error in get_compatible_cases: {e}")
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/psu/compatible/<int:total_tdp>", methods=["GET"])
def get_compatible_psu(total_tdp):
    """
    API route to get PSUs compatible with a system having the specified total TDP.
    
    Args:
        total_tdp (int): Total power consumption (TDP) of the system in watts
    
    Returns:
        JSON response with compatible PSUs or error message.
    """
    try:
        # Call the DAL function to get compatible PSUs
        psus, status = dal_PSU_vs_TotalTDP(total_tdp)
        
        # Return the result
        if status == 200:
            return jsonify(psus), 200
        else:
            return jsonify(psus), status
    except Exception as e:
        print(f"Error in get_compatible_psu: {e}")
        return jsonify({"error": str(e)}), 500

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

@product_blueprint.route("/image-proxy", methods=["GET"])
def image_proxy():
    """
    Proxy endpoint để lấy hình ảnh từ Google Drive, giúp tránh các giới hạn của Drive.
    
    Query parameters:
        url: URL của hình ảnh cần proxy
        id: Google Drive file ID (thay thế cho url)
    
    Returns:
        Binary image data với content-type phù hợp.
    """
    try:
        # Lấy URL từ query parameter
        image_url = request.args.get('url')
        file_id = request.args.get('id')
        
        if not image_url and not file_id:
            return jsonify({"error": "Missing 'url' or 'id' parameter"}), 400
            
        # Nếu cung cấp file_id, tạo URL
        if file_id and not image_url:
            image_url = f"https://drive.google.com/uc?export=view&id={file_id}"
          # Kiểm tra nếu URL là từ Google Drive (có thể mở rộng hỗ trợ thêm các nguồn khác)
        if not image_url.startswith('https://drive.google.com/') and not image_url.startswith('https://'):
            return jsonify({"error": "Only valid HTTPS URLs are supported"}), 400
            
        logger.info(f"Proxying image from: {image_url}")
        
        # Thực hiện request để lấy hình ảnh
        response = requests.get(image_url, stream=True, timeout=10)
        
        if response.status_code != 200:
            logger.error(f"Failed to fetch image: HTTP {response.status_code}")
            return jsonify({"error": f"Failed to fetch image: HTTP {response.status_code}"}), 502
            
        # Xác định content-type
        content_type = response.headers.get('Content-Type', 'image/jpeg')
        
        # Trả về response sử dụng Flask Response object
        return Response(
            response.iter_content(chunk_size=10*1024),
            content_type=content_type,
            headers={
                'Cache-Control': 'public, max-age=86400',  # Cache 1 ngày
                'Access-Control-Allow-Origin': '*'
            }
        )
        
    except Exception as e:
        logger.error(f"Error in image_proxy: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@product_blueprint.route("/p/<file_id>", methods=["GET"])
def proxy_by_id(file_id):
    """
    Phiên bản ngắn gọn của proxy chỉ sử dụng Google Drive file ID.
    URL sẽ trông giống: /api/product/p/1a2b3c4d5e
    """
    try:
        if not file_id:
            return jsonify({"error": "Missing file ID"}), 400
            
        image_url = f"https://drive.google.com/uc?export=view&id={file_id}"
        logger.info(f"Proxying image by ID from: {image_url}")
        
        # Thực hiện request để lấy hình ảnh
        response = requests.get(image_url, stream=True, timeout=10)
        
        if response.status_code != 200:
            logger.error(f"Failed to fetch image: HTTP {response.status_code}")
            return jsonify({"error": f"Failed to fetch image: HTTP {response.status_code}"}), 502
            
        # Xác định content-type
        content_type = response.headers.get('Content-Type', 'image/jpeg')
        
        # Trả về response sử dụng Flask Response object
        return Response(
            response.iter_content(chunk_size=10*1024),
            content_type=content_type,
            headers={
                'Cache-Control': 'public, max-age=86400',  # Cache 1 ngày
                'Access-Control-Allow-Origin': '*'
            }
        )
        
    except Exception as e:
        logger.error(f"Error in proxy_by_id: {str(e)}")
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
