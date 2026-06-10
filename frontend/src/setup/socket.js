import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const socket = io(
    SOCKET_URL,
    {
        autoConnect: false,
        // Thêm cấu hình extraHeaders ở đây
        extraHeaders: {
            "ngrok-skip-browser-warning": "true"
        }
    }
);

export default socket;