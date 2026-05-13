from config import get_db_connection
from mysql.connector import Error
from datetime import datetime

def submit_review(user_id, product_id, order_id, rating, comment):
    """
    Submit a new review or update an existing review
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        
        # Check if review already exists
        check_query = """
        SELECT id FROM reviews WHERE user_id = %s AND product_id = %s AND order_id = %s
        """
        cursor.execute(check_query, (user_id, product_id, order_id))
        existing_review = cursor.fetchone()
        
        if existing_review:
            # Update existing review
            update_query = """
            UPDATE reviews SET rating = %s, comment = %s
            WHERE user_id = %s AND product_id = %s AND order_id = %s
            """
            cursor.execute(update_query, (rating, comment, user_id, product_id, order_id))
            review_id = existing_review['id']
        else:
            # Insert new review
            insert_query = """
            INSERT INTO reviews (user_id, product_id, order_id, rating, comment)
            VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(insert_query, (user_id, product_id, order_id, rating, comment))
            review_id = cursor.lastrowid
            
        connection.commit()
        return review_id
    except Error as e:
        print(f"Error submitting review: {e}")
        return None
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def get_product_reviews(product_id):
    """
    Get all reviews for a specific product
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        
        query = """
        SELECT r.id, r.user_id, r.product_id, r.rating, r.comment, r.created_at, 
               r.updated_at, u.name as user_name, u.email as user_email
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.product_id = %s
        ORDER BY r.created_at DESC
        """
        cursor.execute(query, (product_id,))
        reviews = cursor.fetchall()
        
        return reviews
    except Error as e:
        print(f"Error retrieving product reviews: {e}")
        return []
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def get_user_reviews(user_id):
    """
    Get all reviews by a specific user
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        
        query = """
        SELECT r.id, r.product_id, r.order_id, r.rating, r.comment, r.created_at, 
               r.updated_at, p.title as product_name, p.image as product_image
        FROM reviews r
        JOIN products p ON r.product_id = p.id
        WHERE r.user_id = %s
        ORDER BY r.created_at DESC
        """
        cursor.execute(query, (user_id,))
        reviews = cursor.fetchall()
        
        # Format the results for better consumption
        for review in reviews:
            if 'product_image' in review and review['product_image']:
                review['product_image'] = review['product_image'].split('; ')[0] if review['product_image'] else None
        
        return reviews
    except Error as e:
        print(f"Error retrieving user reviews: {e}")
        return []
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def delete_review(review_id, user_id):
    """
    Delete a review (only if it belongs to the specified user)
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # Check if review exists and belongs to the user
        check_query = """
        SELECT id FROM reviews WHERE id = %s AND user_id = %s
        """
        cursor.execute(check_query, (review_id, user_id))
        review = cursor.fetchone()
        
        if not review:
            return False
        
        # Delete the review
        delete_query = """
        DELETE FROM reviews WHERE id = %s
        """
        cursor.execute(delete_query, (review_id,))
        connection.commit()
        
        return True
    except Error as e:
        print(f"Error deleting review: {e}")
        return False
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def check_order_reviewed(order_id, product_id=None):
    """
    Check if a specific order item has already been reviewed.
    If product_id is provided, checks for that specific product in the order.
    Returns True if reviewed, False otherwise.
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        if product_id is not None:
            query = """
            SELECT id FROM reviews WHERE order_id = %s AND product_id = %s LIMIT 1
            """
            cursor.execute(query, (order_id, product_id))
        else:
            query = """
            SELECT id FROM reviews WHERE order_id = %s LIMIT 1
            """
            cursor.execute(query, (order_id,))

        result = cursor.fetchone()
        return result is not None
    except Error as e:
        print(f"Error checking order review status: {e}")
        return False
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def get_product_rating_summary(product_id):
    """
    Get rating summary for a product (average rating and count by rating value)
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        
        # Get average rating and total count
        avg_query = """
        SELECT 
            COUNT(*) as total_reviews, 
            AVG(rating) as average_rating,
            SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
            SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
            SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
            SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
            SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
        FROM reviews
        WHERE product_id = %s
        """
        cursor.execute(avg_query, (product_id,))
        summary = cursor.fetchone()
        
        # Format the results
        if summary and summary['average_rating'] is not None:
            summary['average_rating'] = float(summary['average_rating'])
        else:
            summary = {
                'total_reviews': 0,
                'average_rating': 0,
                'five_star': 0,
                'four_star': 0,
                'three_star': 0,
                'two_star': 0,
                'one_star': 0
            }
        
        return summary
    except Error as e:
        print(f"Error retrieving product rating summary: {e}")
        return None
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

