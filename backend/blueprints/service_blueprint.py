import os

from flask import Blueprint, redirect, request, jsonify, session
from DAL.service_dal import *
import stripe, time, hmac, hashlib, json, requests, urllib.request, urllib.parse
from context.email_utils import send_order_confirmation_email

service_blueprint = Blueprint('service', __name__)
ZALOPAY_CONFIG = {
    "app_id": "2553",
    "key1": "PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL",
    "key2": "kLtgPl8HHhfvMuDHPwKfgfsY4Ydm9eIz",
    "create_order_endpoint": "https://sb-openapi.zalopay.vn/v2/create",
    "query_order_endpoint": "https://sb-openapi.zalopay.vn/v2/query",
}
YOUR_DOMAIN = 'http://localhost:3000'
stripe_client = stripe.StripeClient(os.getenv("STRIPE_API_KEY"))

@service_blueprint.route("/create_order", methods=["POST"])
def create_order():
    data = request.json
    amount = int(float(data.get("amount", 10000)))
    embed_data = {
        "redirecturl": f"http://localhost:3000/checkPayment",
    }
    app_trans_id = time.strftime("%y%m%d") + "_" + str(int(time.time()))
    app_time = int(time.time() * 1000)

    order = {
        "app_id": ZALOPAY_CONFIG["app_id"],
        "app_trans_id": app_trans_id,
        "app_user": "user123",
        "app_time": app_time,
        "embed_data": json.dumps(embed_data),
        "item": json.dumps([{}]),
        "amount": amount,
        "description": f"Thanh toán đơn hàng #{app_trans_id}",
        "bank_code": "zalopayapp",
        "callback_url": "http://localhost:3000/products",
    }

    data = f"{order['app_id']}|{order['app_trans_id']}|{order['app_user']}|{order['amount']}|{order['app_time']}|{order['embed_data']}|{order['item']}"
    order["mac"] = hmac.new(ZALOPAY_CONFIG["key1"].encode(), data.encode(), hashlib.sha256).hexdigest()

    try:
        response = requests.post(
            ZALOPAY_CONFIG["create_order_endpoint"],
            data=order,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp_json = response.json()
        resp_json["app_trans_id"] = app_trans_id
        return jsonify(resp_json), response.status_code
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 500

@service_blueprint.route("/checkPayment", methods=["POST"])
def query_order():
    try:
        data = request.json
        app_trans_id = data.get("app_trans_id")
        if not app_trans_id:
            return jsonify({"errCode": 1, "message": "Missing app_trans_id"}), 400

        params = {
            "app_id": ZALOPAY_CONFIG["app_id"],
            "app_trans_id": app_trans_id,
        }
        data_mac = f"{params['app_id']}|{params['app_trans_id']}|{ZALOPAY_CONFIG['key1']}"
        params["mac"] = hmac.new(ZALOPAY_CONFIG["key1"].encode(), data_mac.encode(), hashlib.sha256).hexdigest()

        response = requests.post(
            ZALOPAY_CONFIG["query_order_endpoint"],
            data=params,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500
    
    
@service_blueprint.route('/create-checkout-session', methods=['POST'])
def create_checkout_session():
    data = request.json
    total_amount = int(float(data.get('amount', 10000)))*100
    print("Creating checkout session with amount:", total_amount)  # Debug log
    try:
        checkout_session = stripe_client.v1.checkout.sessions.create(params={
            'line_items': [{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': 'Thanh toán đơn hàng'
                    },
                    'unit_amount': total_amount,  
                },
                'quantity': 1
            }],
            'mode': 'payment',
            'success_url': YOUR_DOMAIN + '/checkPayment?session_id={CHECKOUT_SESSION_ID}',
        })
    except Exception as e:
        return str(e)

    return jsonify({
    "checkout_url": checkout_session.url
})

@service_blueprint.route('/check-payment', methods=['POST'])
def check_payment():
    data = request.get_json()
    print("Received data for check-payment:", data)  # Debug log
    session_id = data.get("session_id")

    if not session_id:
        return jsonify({"err": "Missing session_id"}), 400

    try:
        session = stripe_client.v1.checkout.sessions.retrieve(session_id)
        
        if session.payment_status == 'paid':
            return jsonify({
                "status": "success",
                "payment_status": session.payment_status
            })
        else:
            return jsonify({
                "status": "fail",
                "payment_status": session.payment_status
            })

    except Exception as e:
        return jsonify({"err": str(e)}), 500

@service_blueprint.route('/checkout', methods=['POST'])
def api_checkout():
    try:
        order_data = request.json
        required_fields = ['user_id', 'order_items', 'total_amount', 'payment_method', 'shipping_address']
        for field in required_fields:
            if field not in order_data:
                return jsonify({"errCode": 1, "message": f"Missing required field: {field}"}), 400
        
        # Process checkout
        result = checkout(order_data)
        
        # Send order confirmation email if email is available
        email_data = result.get('email_data', {})
        user_email = email_data.get('user_email')
        
        if user_email:
            # Prepare data for email
            order_email_data = {
                'order_id': email_data.get('order_id'),
                'total_amount': email_data.get('total_amount'),
                'payment_method': email_data.get('payment_method'),
                'shipping_address': email_data.get('shipping_address'),
                'order_items': email_data.get('order_items', [])
            }
            
            # Send confirmation email
            email_sent = send_order_confirmation_email(user_email, order_email_data)
            
            if email_sent:
                return jsonify({
                    "errCode": 0, 
                    "message": result['message'], 
                    "order_id": result['order_id'],
                    "email_sent": True
                }), 200
            else:
                # If email fails, still return success for order but indicate email failure
                return jsonify({
                    "errCode": 0, 
                    "message": result['message'], 
                    "order_id": result['order_id'],
                    "email_sent": False,
                    "email_message": "Order confirmation email could not be sent"
                }), 200
        
        # If no email available, just return success for order
        return jsonify({"errCode": 0, "message": result['message'], "order_id": result['order_id']}), 200

    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500

@service_blueprint.route('/payment/<order_id>', methods=['GET'])
def api_get_payment_by_order_id(order_id):
    try:
        payment = get_payment_by_order_id(order_id)
        if payment:
            return jsonify({"errCode": 0, "data": payment}), 200
        else:
            return jsonify({"errCode": 1, "message": "Payment not found"}), 404
    except Exception as e:
        return jsonify({"errCode": 1, "message": str(e)}), 500





