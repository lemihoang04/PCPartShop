import mysql.connector
import os
from flask_socketio import SocketIO

DATABASE_CONFIG = {
    'user': 'root',
    'password': '',
    'host': 'localhost',  
    'port': 3306,        
    'database': 'techshop_db',
}
ZALOPAY_CONFIG = {
    "app_id": "2553",
    "key1": "PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL",
    "key2": "kLtgPl8HHhfvMuDHPwKfgfsY4Ydm9eIz",
    "create_order_endpoint": "https://sb-openapi.zalopay.vn/v2/create",
    "query_order_endpoint": "https://sb-openapi.zalopay.vn/v2/query",
}

socketio = SocketIO(
    cors_allowed_origins="http://localhost:3000"
)

# File upload configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_uploads')
# Create the folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_db_connection():
    connection = mysql.connector.connect(**DATABASE_CONFIG)
    return connection
