from flask import Blueprint, request, jsonify, session
from DAL.user_dal import get_user_by_id, get_all_users
from DAL.admin_dal import login_admin, get_dashboard_stats
# from DAL.product_dal import get_all_products
from DAL.order_dal import get_all_orders
from datetime import datetime, timedelta
from collections import defaultdict

admin_blueprint = Blueprint('admin', __name__)

@admin_blueprint.route('/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    admin = login_admin(username, password)

    if admin:
        session['admin_logged_in'] = True
        return jsonify({
            "errCode": 0,
            "message": "Login successful",
            "admin": admin
        })
    else:
        return jsonify({
            "errCode": 1,
            "message": "Invalid username or password"
        }), 401

@admin_blueprint.route('/admin/logout', methods=['POST'])
def admin_logout():
    session.pop('admin_logged_in', None)
    return jsonify({
        "errCode": 0,
        "message": "Logged out successfully"
    })

@admin_blueprint.route('/admin/dashboard/stats', methods=['GET'])
def get_dashboard_stats_route():
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    start_date = None
    end_date = None

    if start_date_str or end_date_str:
        if not start_date_str or not end_date_str:
            return jsonify({
                "errCode": 1,
                "message": "Both start_date and end_date are required when filtering by date."
            }), 400

        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({
                "errCode": 1,
                "message": "Dates must be in YYYY-MM-DD format."
            }), 400

        today = datetime.now().date()
        if end_date > today:
            return jsonify({
                "errCode": 1,
                "message": "End date cannot exceed the current date."
            }), 400

        if start_date > end_date:
            return jsonify({
                "errCode": 1,
                "message": "Start date cannot be after end date."
            }), 400

        if (end_date - start_date).days > 30:
            return jsonify({
                "errCode": 1,
                "message": "Date range cannot exceed 30 days."
            }), 400

        start_date_str_val = start_date.strftime('%Y-%m-%d')
        end_date_str_val = end_date.strftime('%Y-%m-%d')
    else:
        start_date_str_val = None
        end_date_str_val = None

    stats = get_dashboard_stats(start_date_str_val, end_date_str_val)
    if stats is None:
        return jsonify({
            "errCode": 1,
            "message": "Failed to fetch dashboard stats"
        }), 500
    return jsonify({
        "errCode": 0,
        "stats": stats
    })

@admin_blueprint.route('/admin/users', methods=['GET'])
def get_admin_users():
    users = get_all_users()
    return jsonify({
        "errCode": 0,
        "users": users or []
    })

@admin_blueprint.route('/admin/orders', methods=['GET'])
def get_admin_orders():
    orders = get_all_orders()
    return jsonify({
        "errCode": 0,
        "orders": orders or []
    })

@admin_blueprint.route('/admin/products', methods=['GET'])
def get_admin_products():
    products = get_all_products()
    return jsonify({
        "errCode": 0,
        "products": products or []
    })