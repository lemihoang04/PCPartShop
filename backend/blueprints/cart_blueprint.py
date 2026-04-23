from flask import Blueprint, request, jsonify
from DAL.cart_dal import *

cart_blueprint = Blueprint('cart', __name__)

@cart_blueprint.route('/addToCart', methods=['POST'])
def add_to_cart():
    data = request.json
    user_id = data.get('user_id')
    product_id = data.get('product_id')
    quantity = data.get('quantity', 1)

    if not user_id or not product_id:
        return jsonify({'error': 'user_id and product_id are required'}), 400

    try:
        result = dal_add_to_cart(user_id, product_id, quantity)
        if result:
            return jsonify({"errCode": 0, 'message': 'Cart updated successfully'}), 200
        else:
            return jsonify({"errCode": 1, 'error': 'Failed to update cart'}), 500
    except Exception as e:
        return jsonify({"errCode": 1, 'error': str(e)}), 500

@cart_blueprint.route('/cart/<int:user_id>', methods=['GET'])
def get_cart(user_id):
    if not user_id:
        return jsonify({'error': 'Missing user_id'}), 400

    try:
        cart_items = dal_get_cart(user_id)
        return jsonify({"errCode": 0, "data": cart_items})
    except Exception as e:
        return jsonify({"errCode": 1, 'error': str(e)}), 500

@cart_blueprint.route('/delete_cart/<int:cart_id>', methods=['DELETE'])
def api_delete_cart(cart_id):
    if(delete_cart(cart_id)):
        return jsonify({"errCode": 0, "message": "Cart deleted successfully"}), 200
    else:
        return jsonify({"errCode": 1, "message": "Cart not found"}), 404

@cart_blueprint.route('/checkOutStock', methods=['POST'])
def api_check_out_stock():
    data = request.json
    items = data.get('items', [])
    if not items:
        return jsonify({'error': 'No items provided'}), 400

    try:
        stock_results = checkOutStock(items)
        return jsonify({"errCode": 0, "data": stock_results}), 200
    except Exception as e:
        return jsonify({"errCode": 1, 'error': str(e)}), 500