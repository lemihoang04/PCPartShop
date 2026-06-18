from flask import Flask
from flask_cors import CORS
import os
from blueprints.user_blueprint import user_blueprint
from blueprints.service_blueprint import service_blueprint
from blueprints.cart_blueprint import cart_blueprint
from blueprints.product_blueprint import product_blueprint
from blueprints.order_blueprint import order_blueprint
from blueprints.category_blueprint import category_blueprint
from blueprints.chatbot_blueprint import chatbot_blueprint
from blueprints.review_blueprint import review_blueprint
from blueprints.admin_blueprint import admin_blueprint
from blueprints.coupon_blueprint import coupon_blueprint
from blueprints.buildpc_blueprint import buildpc_blueprint
from blueprints.notification_blueprint import notification_blueprint
from config import UPLOAD_FOLDER, socketio
import sockets.notification_socket
from flask_jwt_extended import JWTManager
from datetime import timedelta

 
# Create static folder for uploads if it doesn't exist
static_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
os.makedirs(static_folder, exist_ok=True)
os.makedirs(os.path.join(static_folder, 'uploads'), exist_ok=True)

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config["JWT_SECRET_KEY"] = "hoangnopro123"
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)
jwt = JWTManager(app)
app.secret_key = "hoangnopro123" 
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
CORS(app, origins=FRONTEND_URL, supports_credentials=True)

app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True
# Configure upload folder
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 #16MB

app.register_blueprint(user_blueprint)
app.register_blueprint(service_blueprint)
app.register_blueprint(cart_blueprint)
app.register_blueprint(product_blueprint)
app.register_blueprint(order_blueprint)
app.register_blueprint(category_blueprint)
app.register_blueprint(chatbot_blueprint)
app.register_blueprint(review_blueprint)
app.register_blueprint(admin_blueprint)
app.register_blueprint(coupon_blueprint)
app.register_blueprint(buildpc_blueprint)
app.register_blueprint(notification_blueprint)


port = int(os.environ.get("PORT", 5000))
host = os.environ.get("HOST", "127.0.0.1")
socketio.init_app(app)
if __name__ == "__main__":
    socketio.run(app, debug=True, port=port,host=host, allow_unsafe_werkzeug=True)

