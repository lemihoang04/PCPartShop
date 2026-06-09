import mysql.connector
import os
from flask_socketio import SocketIO


# Sử dụng os.getenv ngắn gọn hơn, kết quả trả về y hệt os.environ.get
DATABASE_CONFIG = {
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'host': os.getenv('DB_HOST', 'localhost'),  
    'port': int(os.getenv('DB_PORT', 3306)),  
    'database': os.getenv('DB_NAME', 'techshop_db'),
}

FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
socketio = SocketIO(
    cors_allowed_origins="*",
    ping_timeout=60,
    ping_interval=25
)

# File upload configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_db_connection():
    connection = mysql.connector.connect(**DATABASE_CONFIG)
    return connection