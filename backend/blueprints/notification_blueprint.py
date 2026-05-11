from flask import Blueprint, request, jsonify
from DAL.notification_dal import *

notification_blueprint = Blueprint('notification', __name__)

@notification_blueprint.route('/notifications/<int:user_id>', methods=['GET'])
def api_get_notifications_by_user(user_id):
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        notifications = get_notifications_by_user(user_id, limit, offset)
        return jsonify({"errCode": 0, "notifications": notifications}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@notification_blueprint.route('/notifications/unread-count/<int:user_id>', methods=['GET'])
def api_get_unread_notifications_count(user_id):
    try:
        count = get_unread_notifications_count(user_id)
        return jsonify({"errCode": 0, "unread_count": count}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@notification_blueprint.route('/notifications/create', methods=['POST'])
def api_create_notification():
    try:
        data = request.json or {}
        user_id = data.get('user_id')
        title = data.get('title')
        content = data.get('content')
        type = data.get('type')
        reference_id = data.get('reference_id')

        if not user_id or not title:
            return jsonify({"errCode": 1, "message": "Missing user_id or title"}), 400

        notification_id = create_notification(user_id, title, content, type, reference_id)
        return jsonify({
            "errCode": 0,
            "message": "Notification created successfully",
            "notification_id": notification_id
        }), 201
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@notification_blueprint.route('/notifications/mark-read/<int:notification_id>', methods=['POST'])
def api_mark_notification_as_read(notification_id):
    try:
        data = request.json or {}
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({"errCode": 1, "message": "Missing user_id"}), 400

        success = mark_notification_as_read(notification_id, user_id)
        if success:
            return jsonify({"errCode": 0, "message": "Notification marked as read"}), 200
        else:
            return jsonify({"errCode": 1, "message": "Notification not found or access denied"}), 404
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@notification_blueprint.route('/notifications/mark-all-read/<int:user_id>', methods=['POST'])
def api_mark_all_notifications_as_read(user_id):
    try:
        mark_all_notifications_as_read(user_id)
        return jsonify({"errCode": 0, "message": "All notifications marked as read"}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@notification_blueprint.route('/notifications/delete/<int:notification_id>', methods=['DELETE'])
def api_delete_notification(notification_id):
    try:
        # Check both JSON body and query string parameters for user_id (for client libraries that do not send bodies in DELETE)
        data = request.json or {}
        user_id = data.get('user_id')
        if not user_id:
            user_id = request.args.get('user_id', type=int)

        if not user_id:
            return jsonify({"errCode": 1, "message": "Missing user_id"}), 400

        success = delete_notification(notification_id, user_id)
        if success:
            return jsonify({"errCode": 0, "message": "Notification deleted successfully"}), 200
        else:
            return jsonify({"errCode": 1, "message": "Notification not found or access denied"}), 404
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@notification_blueprint.route('/notifications/clear-all/<int:user_id>', methods=['DELETE'])
def api_clear_all_notifications(user_id):
    try:
        clear_all_notifications(user_id)
        return jsonify({"errCode": 0, "message": "All notifications cleared"}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500
