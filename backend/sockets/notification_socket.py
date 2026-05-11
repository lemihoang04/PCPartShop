from flask_socketio import join_room
from config import socketio

@socketio.on("join")
def handle_join(data):
    user_id = data["user_id"]

    join_room(str(user_id))

    print(f"User {user_id} joined")