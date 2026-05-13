from flask import Blueprint, request, jsonify
from DAL.review_dal import *

review_blueprint = Blueprint('review', __name__)

@review_blueprint.route('/product/rating', methods=['POST'])
def submit_product_review():
    """
    Submit a new product review from order
    """
    try:
        data = request.json
        required_fields = ['orderId', 'productId', 'rating']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    "errCode": 1,
                    "message": f"Missing required field: {field}"
                })
        
        # Extract data from request
        user_id = data.get('userId')  # Can be included in the request or extracted from JWT token
        order_id = data.get('orderId')
        product_id = data.get('productId')
        rating = data.get('rating')
        comment = data.get('comment', '')
        
        # Validate rating value
        if not isinstance(rating, int) or rating < 1 or rating > 5:
            return jsonify({
                "errCode": 1,
                "message": "Rating must be an integer between 1 and 5"
            })
        
        # Submit the review
        review_id = submit_review(user_id, product_id, order_id, rating, comment)
        
        if review_id is not None:
            return jsonify({
                "errCode": 0,
                "message": "Review submitted successfully",
                "reviewId": review_id
            })
        else:
            return jsonify({
                "errCode": 1,
                "message": "Failed to submit review"
            })
        
    except Exception as e:
        print(f"Error processing review submission: {e}")
        return jsonify({
            "errCode": 1,
            "message": f"An error occurred: {str(e)}"
        })

@review_blueprint.route('/product/<int:product_id>/reviews', methods=['GET'])
def get_reviews_for_product(product_id):
    """
    Get all reviews for a specific product
    """
    try:
        reviews = get_product_reviews(product_id)
        
        # Format date fields if needed
        for review in reviews:
            if 'created_at' in review and review['created_at']:
                review['created_at'] = review['created_at'].isoformat()
            if 'updated_at' in review and review['updated_at']:
                review['updated_at'] = review['updated_at'].isoformat()
        
        return jsonify({
            "errCode": 0,
            "message": "Reviews retrieved successfully",
            "reviews": reviews
        })
    except Exception as e:
        print(f"Error retrieving product reviews: {e}")
        return jsonify({
            "errCode": 1,
            "message": f"An error occurred: {str(e)}"
        })

@review_blueprint.route('/product/<int:product_id>/rating-summary', methods=['GET'])
def get_product_reviews_summary(product_id):
    """
    Get summary of ratings for a product
    """
    try:
        summary = get_product_rating_summary(product_id)
        
        if summary is None:
            return jsonify({
                "errCode": 1,
                "message": "Failed to retrieve rating summary"
            })
        
        return jsonify({
            "errCode": 0,
            "message": "Rating summary retrieved successfully",
            "summary": summary
        })
    except Exception as e:
        print(f"Error retrieving product rating summary: {e}")
        return jsonify({
            "errCode": 1,
            "message": f"An error occurred: {str(e)}"
        })

@review_blueprint.route('/user/<int:user_id>/reviews', methods=['GET'])
def get_reviews_by_user(user_id):
    """
    Get all reviews submitted by a user
    """
    try:
        reviews = get_user_reviews(user_id)
        
        # Format date fields if needed
        for review in reviews:
            if 'created_at' in review and review['created_at']:
                review['created_at'] = review['created_at'].isoformat()
            if 'updated_at' in review and review['updated_at']:
                review['updated_at'] = review['updated_at'].isoformat()
        
        return jsonify({
            "errCode": 0,
            "message": "User reviews retrieved successfully",
            "reviews": reviews
        })
    except Exception as e:
        print(f"Error retrieving user reviews: {e}")
        return jsonify({
            "errCode": 1,
            "message": f"An error occurred: {str(e)}"
        })

@review_blueprint.route('/order/<order_id>/reviewed', methods=['GET'])
def check_order_review_status(order_id):
    """
    Check if an order item has already been reviewed.
    Optional query param: product_id
    """
    try:
        product_id = request.args.get('product_id', type=int)
        is_reviewed = check_order_reviewed(order_id, product_id)
        return jsonify({
            "errCode": 0,
            "is_reviewed": is_reviewed
        })
    except Exception as e:
        print(f"Error checking order review status: {e}")
        return jsonify({
            "errCode": 1,
            "message": f"An error occurred: {str(e)}"
        })

@review_blueprint.route('/review/<int:review_id>', methods=['DELETE'])
def remove_review(review_id):
    """
    Delete a review
    """
    try:
        # In a real app, you would extract user_id from authentication token
        # Here we get it from the request for simplicity
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({
                "errCode": 1,
                "message": "Missing user_id parameter"
            })
            
        success = delete_review(review_id, user_id)
        
        if success:
            return jsonify({
                "errCode": 0,
                "message": "Review deleted successfully"
            })
        else:
            return jsonify({
                "errCode": 1,
                "message": "Review not found or you don't have permission to delete it"
            })
    except Exception as e:
        print(f"Error deleting review: {e}")
        return jsonify({
            "errCode": 1,
            "message": f"An error occurred: {str(e)}"
        })
