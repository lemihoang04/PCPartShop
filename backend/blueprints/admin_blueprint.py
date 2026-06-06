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
    stats = get_dashboard_stats()
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