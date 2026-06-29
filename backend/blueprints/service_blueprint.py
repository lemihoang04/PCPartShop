import os

from flask import Blueprint, request, jsonify, session
from DAL.service_dal import *
import stripe
from context.email_utils import send_order_confirmation_email

service_blueprint = Blueprint('service', __name__)

YOUR_DOMAIN = os.getenv('FRONTEND_URL', 'http://localhost:3000')
stripe_client = stripe.StripeClient(os.getenv("STRIPE_API_KEY"))

    
@service_blueprint.route('/create-checkout-session', methods=['POST'])
def create_checkout_session():
    data = request.json
    total_amount = int(round(float(data.get('amount', 10000)) * 100))
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
    session_id = data.get("session_id")

    if not session_id:
        return jsonify({"err": "Missing session_id"}), 400

    try:
        session = stripe_client.v1.checkout.sessions.retrieve(session_id)

        if session.payment_status == "paid":
            return jsonify({
                "status": "success",
                "payment_status": session.payment_status,
                "payment_intent": session.payment_intent
            })
        else:
            return jsonify({
                "status": "fail",
                "payment_status": session.payment_status,
                "payment_intent": session.payment_intent
            })

    except Exception as e:
        return jsonify({"err": str(e)}), 500

@service_blueprint.route('/checkout', methods=['POST'])
def api_checkout():
    try:
        order_data = request.json
        required_fields = ['user_id', 'order_items', 'total_amount', 'payment_method', 'shipping_address', 'payment_intent']
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





