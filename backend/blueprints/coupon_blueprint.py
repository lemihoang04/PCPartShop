from flask import Blueprint, request, jsonify
from DAL.coupon_dal import (
    get_all_coupons,
    get_coupon_by_id,
    create_coupon,
    update_coupon,
    delete_coupon,
    validate_coupon,
)

coupon_blueprint = Blueprint('coupon', __name__)


# ─── CRUD ─────────────────────────────────────────────────────────────────────

@coupon_blueprint.route('/coupons', methods=['GET'])
def api_get_all_coupons():
    """Return all coupons (admin use)."""
    try:
        coupons = get_all_coupons()
        return jsonify({"errCode": 0, "data": coupons}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@coupon_blueprint.route('/coupons/<int:coupon_id>', methods=['GET'])
def api_get_coupon(coupon_id):
    """Return a single coupon by id."""
    try:
        coupon = get_coupon_by_id(coupon_id)
        if not coupon:
            return jsonify({"errCode": 1, "message": "Coupon not found"}), 404
        return jsonify({"errCode": 0, "data": coupon}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@coupon_blueprint.route('/coupons', methods=['POST'])
def api_create_coupon():
    """Create a new coupon."""
    try:
        data = request.json
        required = ['code', 'discount_type', 'discount_value']
        for field in required:
            if field not in data:
                return jsonify({"errCode": 1, "message": f"Missing field: {field}"}), 400
        if data['discount_type'] not in ('percent', 'fixed'):
            return jsonify({"errCode": 1, "message": "discount_type must be 'percent' or 'fixed'"}), 400

        coupon_id = create_coupon(data)
        return jsonify({"errCode": 0, "message": "Coupon created", "id": coupon_id}), 201
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@coupon_blueprint.route('/coupons/<int:coupon_id>', methods=['PUT'])
def api_update_coupon(coupon_id):
    """Update an existing coupon."""
    try:
        data = request.json
        rows = update_coupon(coupon_id, data)
        if rows == 0:
            return jsonify({"errCode": 1, "message": "Coupon not found or no change"}), 404
        return jsonify({"errCode": 0, "message": "Coupon updated"}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


@coupon_blueprint.route('/coupons/<int:coupon_id>', methods=['DELETE'])
def api_delete_coupon(coupon_id):
    """Delete a coupon."""
    try:
        rows = delete_coupon(coupon_id)
        if rows == 0:
            return jsonify({"errCode": 1, "message": "Coupon not found"}), 404
        return jsonify({"errCode": 0, "message": "Coupon deleted"}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500


# ─── VALIDATE (called from Checkout) ─────────────────────────────────────────

@coupon_blueprint.route('/coupons/validate', methods=['POST'])
def api_validate_coupon():
    """
    Validate a coupon code for a specific user and order amount.
    Body: { code, user_id, order_amount }
    Does NOT record usage yet.
    """
    try:
        data = request.json
        code = data.get('code', '').strip()
        user_id = data.get('user_id')
        order_amount = data.get('order_amount', 0)

        if not code or not user_id:
            return jsonify({"errCode": 1, "message": "Missing code or user_id"}), 400

        result = validate_coupon(code, user_id, order_amount)
        if result['valid']:
            return jsonify({"errCode": 0, **result}), 200
        else:
            return jsonify({"errCode": 1, "message": result['message']}), 200
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500
