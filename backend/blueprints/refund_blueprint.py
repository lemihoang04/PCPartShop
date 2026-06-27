from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from DAL.refund_dal import (
    create_refund_request,
    get_refunds_by_user_id,
    get_refund_by_id,
)

refund_blueprint = Blueprint('refund', __name__)


@refund_blueprint.route('/refunds', methods=['POST'])
@jwt_required()
def api_create_refund():
    """
    Tạo yêu cầu trả hàng / hoàn tiền.

    Body JSON:
    {
        "order_item_id": 15,
        "reason": "Sản phẩm bị lỗi",
        "images": "url1;url2;url3"   (tuỳ chọn)
    }
    """
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()

        order_item_id = data.get('order_item_id')
        reason = data.get('reason', '').strip()
        images = data.get('images', None)

        # --- Validation cơ bản ---
        if not order_item_id:
            return jsonify({"errCode": 1, "message": "order_item_id is required"}), 400
        if not reason:
            return jsonify({"errCode": 1, "message": "reason is required"}), 400

        result = create_refund_request(
            order_item_id=order_item_id,
            user_id=user_id,
            reason=reason,
            images=images
        )

        return jsonify({
            "errCode": 0,
            "message": "Refund request created successfully",
            "data": result
        }), 201

    except PermissionError as e:
        return jsonify({"errCode": 403, "message": str(e)}), 403
    except ValueError as e:
        return jsonify({"errCode": 1, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@refund_blueprint.route('/refunds/user/<int:user_id>', methods=['GET'])
@jwt_required()
def api_get_refunds_by_user(user_id):
    """Lấy danh sách yêu cầu refund của user."""
    try:
        current_user_id = int(get_jwt_identity())

        # Chỉ cho phép user xem refund của chính mình (admin có thể bỏ check này)
        if current_user_id != user_id:
            return jsonify({"errCode": 403, "message": "Access denied"}), 403

        refunds = get_refunds_by_user_id(user_id)
        return jsonify({"errCode": 0, "data": refunds}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@refund_blueprint.route('/refunds/<int:refund_id>', methods=['GET'])
@jwt_required()
def api_get_refund_by_id(refund_id):
    """Lấy chi tiết một yêu cầu refund."""
    try:
        current_user_id = int(get_jwt_identity())
        refund = get_refund_by_id(refund_id)

        if not refund:
            return jsonify({"errCode": 1, "message": "Refund not found"}), 404

        # Chỉ cho phép user xem refund của chính mình
        if refund['user_id'] != current_user_id:
            return jsonify({"errCode": 403, "message": "Access denied"}), 403

        return jsonify({"errCode": 0, "data": refund}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500
