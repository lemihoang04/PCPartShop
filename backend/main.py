from flask import Flask
from flask_cors import CORS
import os
from blueprints.user_blueprint import user_blueprint
from blueprints.service_blueprint import service_blueprint
from blueprints.cart_blueprint import cart_blueprint
from blueprints.product_blueprint import product_blueprint
from blueprints.order_blueprint import order_blueprint
from blueprints.category_blueprint import category_blueprint
# from blueprints.chatbot_blueprint import chatbot_blueprint
from blueprints.review_blueprint import review_blueprint
from blueprints.admin_blueprint import admin_blueprint
from blueprints.coupon_blueprint import coupon_blueprint
from blueprints.buildpc_blueprint import buildpc_blueprint
from config import UPLOAD_FOLDER
 
# Create static folder for uploads if it doesn't exist
static_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
os.makedirs(static_folder, exist_ok=True)
os.makedirs(os.path.join(static_folder, 'uploads'), exist_ok=True)

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.secret_key = "phuocnopro123" 
CORS(app, origins="http://localhost:3000", supports_credentials=True)

# Configure upload folder
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 #16MB

app.register_blueprint(user_blueprint)
app.register_blueprint(service_blueprint)
app.register_blueprint(cart_blueprint)
app.register_blueprint(product_blueprint)
app.register_blueprint(order_blueprint)
app.register_blueprint(category_blueprint)
# app.register_blueprint(chatbot_blueprint)
app.register_blueprint(review_blueprint)
app.register_blueprint(admin_blueprint)
app.register_blueprint(coupon_blueprint)
app.register_blueprint(buildpc_blueprint)
if __name__ == "__main__":
    app.run(debug=True, port=5000)

