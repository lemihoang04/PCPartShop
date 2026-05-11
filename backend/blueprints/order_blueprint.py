from flask import Blueprint, request, jsonify
from DAL.order_dal import *
from DAL.notification_dal import *
from config import socketio
order_blueprint = Blueprint('order', __name__)

@order_blueprint.route('/orders/<int:user_id>', methods=['GET'])
def api_get_orders_by_user(user_id):
    try:
        orders = get_orders_by_user_id(user_id)
        return jsonify({"errCode": 0, "orders": orders}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500
    
@order_blueprint.route('/orders/all', methods=['GET'])
def api_get_all_orders():
    try:
        orders = get_all_orders()
        return jsonify({"errCode": 0, "orders": orders}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@order_blueprint.route('/order/<order_id>', methods=['GET'])
def api_get_order_by_id(order_id):
    try:
        order = get_order_by_id(order_id)
        if order:
            return jsonify({"errCode": 0, "data": order}), 200
        else:
            return jsonify({"errCode": 1, "message": "Order not found"}), 404
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500
    
@order_blueprint.route('/orders/approve/<order_id>', methods=['POST'])
def api_approve_order(order_id):
    try:
        if not order_id:
            return jsonify({"errCode": 1, "message": "Missing order_id"}), 400
        affected = approve_order(order_id)
        if affected > 0:
            return jsonify({"errCode": 0, "message": "Order approved successfully"}), 200
        else:
            return jsonify({"errCode": 1, "message": "Order not found or not in pending status"}), 404
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@order_blueprint.route('/orders/cancel/<order_id>', methods=['POST'])
def api_cancel_order(order_id):
    try:
        if not order_id:
            return jsonify({"errCode": 1, "message": "Missing order_id"}), 400
        affected = cancel_order(order_id)
        if affected > 0:
            return jsonify({"errCode": 0, "message": "Order cancelled successfully"}), 200
        else:
            return jsonify({"errCode": 1, "message": "Order not found or already cancelled"}), 404
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@order_blueprint.route('/order/history/<order_id>', methods=['GET'])
def api_get_order_status_history(order_id):
    try:
        history = get_order_status_history(order_id)
        return jsonify({"errCode": 0, "data": history}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@order_blueprint.route('/orders/update-status/<order_id>', methods=['POST'])
def api_update_order_status(order_id):
    try:
        data = request.json
        next_status = data.get('status')
        if not order_id or not next_status:
            return jsonify({"errCode": 1, "message": "Missing order_id or status"}), 400
        affected = update_order_status(order_id, next_status)
        if affected > 0:
            order = get_order_by_id(order_id)
            user_id = order.get('user_id')
            title = "Order Updated"
            message = (
                f"Your order #{order_id} "
                f"is now {next_status}"
            )
            notification_type = 'order'
            reference_id = order_id
            notification_id = create_notification(user_id, title, message, notification_type, reference_id)
            # Emit notification event
            socketio.emit('new_notification', {
                'id': notification_id,
                'title': title,
                'message': message,
                'type': notification_type,
                'reference_id': reference_id
            },
            to=str(user_id)
            )
            return jsonify({"errCode": 0, "message": "Order status updated successfully"}), 200
        else:
            return jsonify({"errCode": 1, "message": "Order not found"}), 404
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500