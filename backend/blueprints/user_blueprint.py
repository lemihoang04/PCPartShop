from flask import Blueprint, request, jsonify, session
from DAL.user_dal import *
from datetime import datetime, timedelta
from context.email_utils import send_otp_email

user_blueprint = Blueprint('user', __name__)

@user_blueprint.route('/register', methods=['POST'])
def api_create_user():
    data = request.form
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    phone = data.get('phone')

    if not all([name, email, password, phone]):
        return jsonify({"errCode": 1, "error": "Missing required information"}), 400
    
    if check_existing_user(email, phone):
        return jsonify({"errCode": 1, "error": "Email or phone already exists"}), 409

    create_user(name, email, password, phone)
    return jsonify({"errCode": 0, "message": "User successfully created"}), 201

@user_blueprint.route('/api/account', methods=['GET'])
def get_user():
    print("SESSION:", dict(session))
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"errCode": 1, "message": "Not authenticated"}), 401
    user = get_user_by_id(user_id)
    cart_items_count = get_number_of_cart_items(user_id)
    print(f"User ID: {user_id}, Cart Items Count: {cart_items_count}")
    if user:
        return jsonify({"errCode": 0, "user": user, "cart_items_count": cart_items_count}), 200
    else:
        return jsonify({"errCode": 1, "message": "User not found"}), 404

@user_blueprint.route('/users', methods=['GET'])
def api_get_all_users():
    users = get_all_users()
    return jsonify(users), 200

@user_blueprint.route('/users/<int:user_id>', methods=['GET'])
def api_get_user_by_id(user_id):
    user = get_user_by_id(user_id)
    if user:
        return jsonify(user), 200
    else:
        return jsonify({"error": "User does not exist"}), 404

@user_blueprint.route('/users/<int:user_id>', methods=['PUT'])
def api_update_user(user_id):
    data = request.form
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    phone = data.get('phone')
    address = data.get('address')  

    user = get_user_by_id(user_id)
    if not any([name, email, password, phone, address]):
        return jsonify({"error": "No information to update"}), 400
    
    if check_phone_existing(phone) and user['phone'] != phone:
        return jsonify({"errCode": 1, "error": "Phone already exists"}), 409
    
    update_user(user_id, name=name, email=email, password=password, phone=phone, address=address)
    return jsonify({"errCode": 0, "message": "User information successfully updated"}), 200

@user_blueprint.route('/users/<int:user_id>', methods=['DELETE'])
def api_delete_user(user_id):
    delete_user(user_id)
    return jsonify({"errCode": 0, "message": "User has been deleted"}), 200

@user_blueprint.route('/login', methods=['POST'])
def api_login():
    data = request.form
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400

    user = login(email, password)

    if user:
        session['user_id'] = user['id']
        print(f"User ID {session['user_id']} logged in")
        session['email'] = email
        return jsonify({"errCode": 0, "user": user}), 200
    else:
        return jsonify({"error": "Wrong email or password"}), 404

@user_blueprint.route('/changePassword', methods=['PUT'])
def api_change_password():    
    data = request.json
    user_id = data.get('userid')
    if not user_id:
        return jsonify({"errCode": 1, "message": "Not authenticated"}), 401
    old_password = data.get('oldPassword')
    new_password = data.get('newPassword')

    if not old_password or not new_password:
        return jsonify({"errCode": 1, "message": "Missing old or new password"}), 400
    success = change_password(user_id, old_password, new_password)
    if success:
        return jsonify({"errCode": 0, "message": "Password changed successfully"}), 200
    else:
        return jsonify({"errCode": 1, "message": "Old password is incorrect"}), 400

@user_blueprint.route('/logout', methods=['POST'])
def api_logout():
    session.pop('user_id', None)
    session.pop('email', None)
    return jsonify({"errCode": 0, "message": "Logged out successfully"}), 200

@user_blueprint.route('/forgotPassword', methods=['POST'])
def api_forgot_password():
    data = request.json
    email = data.get('email')
    
    if not email:
        return jsonify({"errCode": 1, "message": "Email is required"}), 400
    
    # Check if user with this email exists
    user = get_user_by_email(email)
    if not user:
        return jsonify({"errCode": 1, "message": "Email not found"}), 404
    otp_code = generate_otp()
    expiry_time = datetime.utcnow() + timedelta(minutes=5)
    create_otp(email, otp_code, expiry_time)
    email_sent = send_otp_email(email, otp_code)
    
    if not email_sent:
        return jsonify({"errCode": 1, "message": "Failed to send OTP email. Please try again."}), 500
    
    return jsonify({
        "errCode": 0, 
        "message": "OTP sent successfully to your email"
    }), 200

@user_blueprint.route('/verifyOTP', methods=['POST'])
def api_verify_otp():
    data = request.json
    email = data.get('email')
    otp = data.get('otp')
    
    if not email or not otp:
        return jsonify({"errCode": 1, "message": "Email and OTP are required"}), 400
    
    # Verify OTP
    is_valid = verify_otp(email, otp)
    
    if not is_valid:
        return jsonify({"errCode": 1, "message": "Invalid or expired OTP"}), 400
    
    return jsonify({"errCode": 0, "message": "OTP verified successfully"}), 200

@user_blueprint.route('/resetPassword', methods=['POST'])
def api_reset_password():
    data = request.json
    email = data.get('email')
    otp = data.get('otp')
    new_password = data.get('newPassword')
    
    if not email or not otp or not new_password:
        return jsonify({"errCode": 1, "message": "Email, OTP, and new password are required"}), 400
    
    # Verify OTP again as an extra security measure
    is_valid = verify_otp(email, otp)
    
    if not is_valid:
        return jsonify({"errCode": 1, "message": "Invalid or expired OTP"}), 400
    
    # Reset the password
    success = reset_password(email, new_password)
    
    if not success:
        return jsonify({"errCode": 1, "message": "Failed to reset password"}), 500
    
    # Delete the used OTP
    delete_otp(email)
    
    return jsonify({"errCode": 0, "message": "Password reset successfully"}), 200