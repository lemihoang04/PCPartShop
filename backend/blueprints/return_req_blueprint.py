import os
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import stripe
from DAL.return_req_dal import (
    create_return_request,
    get_return_requests_by_user,
    get_return_request_by_id,
    cancel_return_request,
    get_all_return_requests,
    update_return_request_status,
)

stripe_client = stripe.StripeClient(os.getenv("STRIPE_API_KEY"))


return_req_blueprint = Blueprint('return_req', __name__)


@return_req_blueprint.route('/return-requests', methods=['POST'])
@jwt_required()
def api_create_return_request():
    """
    Tạo yêu cầu trả hàng (REFUND) hoặc đổi hàng (EXCHANGE).

    Body JSON:
    {
        "order_item_id": 15,
        "request_type": "REFUND",        -- hoặc "EXCHANGE"
        "reason": "Sản phẩm bị lỗi",
        "images": "url1;url2;url3"       -- tuỳ chọn
    }

    - REFUND  : backend tự tính refund_amount = price × quantity
    - EXCHANGE: refund_amount để NULL, admin xử lý đổi hàng
    """
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()

        order_item_id = data.get('order_item_id')
        request_type  = data.get('request_type', '').strip().upper()
        reason        = data.get('reason', '').strip()
        images        = data.get('images', None)

        # --- Validation cơ bản ---
        if not order_item_id:
            return jsonify({"errCode": 1, "message": "order_item_id is required"}), 400
        if request_type not in ('REFUND', 'EXCHANGE'):
            return jsonify({"errCode": 1, "message": "request_type must be 'REFUND' or 'EXCHANGE'"}), 400
        if not reason:
            return jsonify({"errCode": 1, "message": "reason is required"}), 400

        result = create_return_request(
            order_item_id=order_item_id,
            user_id=user_id,
            request_type=request_type,
            reason=reason,
            images=images
        )

        return jsonify({
            "errCode": 0,
            "message": "Return request created successfully",
            "data": result
        }), 200

    except PermissionError as e:
        return jsonify({"errCode": 403, "message": str(e)}), 403
    except ValueError as e:
        return jsonify({"errCode": 1, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@return_req_blueprint.route('/return-requests/user/<int:user_id>', methods=['GET'])
@jwt_required()
def api_get_return_requests_by_user(user_id):
    """Lấy danh sách return requests của một user."""
    try:
        current_user_id = int(get_jwt_identity())

        if current_user_id != user_id:
            return jsonify({"errCode": 403, "message": "Access denied"}), 403

        data = get_return_requests_by_user(user_id)
        return jsonify({"errCode": 0, "data": data}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@return_req_blueprint.route('/return-requests/<int:request_id>', methods=['GET'])
@jwt_required()
def api_get_return_request_by_id(request_id):
    """Lấy chi tiết một return request."""
    try:
        current_user_id = int(get_jwt_identity())
        item = get_return_request_by_id(request_id)

        if not item:
            return jsonify({"errCode": 1, "message": "Return request not found"}), 404

        if item['user_id'] != current_user_id:
            return jsonify({"errCode": 403, "message": "Access denied"}), 403

        return jsonify({"errCode": 0, "data": item}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@return_req_blueprint.route('/return-requests/<int:request_id>/cancel', methods=['POST'])
@jwt_required()
def api_cancel_return_request(request_id):
    """Huỷ return request nếu đang ở trạng thái PENDING."""
    try:
        current_user_id = int(get_jwt_identity())
        item = get_return_request_by_id(request_id)

        if not item:
            return jsonify({"errCode": 1, "message": "Return request not found"}), 404

        if item['user_id'] != current_user_id:
            return jsonify({"errCode": 403, "message": "Access denied"}), 403

        rows = cancel_return_request(request_id)
        if rows > 0:
            return jsonify({"errCode": 0, "message": "Return request cancelled"}), 200
        else:
            return jsonify({"errCode": 1, "message": "Cannot cancel — request is not in PENDING status"}), 400
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


# ──────────────────────────────────────────────────────────────
# ADMIN endpoints
# ──────────────────────────────────────────────────────────────

@return_req_blueprint.route('/admin/return-requests', methods=['GET'])
@jwt_required()
def api_admin_get_all_return_requests():
    """Admin: lấy toàn bộ return requests."""
    try:
        data = get_all_return_requests()
        return jsonify({"errCode": 0, "data": data}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@return_req_blueprint.route('/admin/return-requests/<int:request_id>/status', methods=['POST'])
@jwt_required()
def api_admin_update_return_request_status(request_id):
    """
    Admin: cập nhật trạng thái return request.

    Body JSON:
    {
        "status": "APPROVED",          -- bước tiếp theo hợp lệ theo flow
        "admin_note": "..."            -- tuỳ chọn
    }
    """
    try:
        body       = request.get_json()
        new_status = body.get('status', '').strip().upper()
        admin_note = body.get('admin_note', None)

        if not new_status:
            return jsonify({"errCode": 1, "message": "status is required"}), 400

        rows = update_return_request_status(
            request_id=request_id,
            new_status=new_status,
            admin_note=admin_note,
            stripe_client=stripe_client,
        )

        if rows > 0:
            return jsonify({"errCode": 0, "message": f"Status updated to {new_status}"}), 200
        else:
            return jsonify({"errCode": 1, "message": "No rows updated"}), 400

    except ValueError as e:
        return jsonify({"errCode": 1, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500
