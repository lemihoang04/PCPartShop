import axios from "../setup/axios";

// Lấy danh sách đơn hàng (có thể truyền userId hoặc "all" cho admin)
export const GetOrdersData = async (userId) => {
    try {
        const url = userId === "all" ? "/orders/all" : `/orders/user/${userId}`;
        const response = await axios.get(url);
        return response; // response is already the data object
    } catch (error) {
        return { errCode: -1, message: error.message };
    }
};
// Hủy đơn hàng theo orderId
export const CancelOrder = async (orderId) => {
    try {
        const response = await axios.post(`/orders/cancel/${orderId}`);
        return response;
    } catch (error) {
        return { errCode: -1, message: error.message };
    }
};

// Duyệt đơn hàng theo orderId
export const ApproveOrder = async (orderId) => {
    try {
        const response = await axios.post(`/orders/approve/${orderId}`);
        return response;
    } catch (error) {
        return { errCode: -1, message: error.message };
    }
};

export const UpdateOrderStatus = async (orderId, status) => {
    try {
        const response = await axios.post(`/orders/update-status/${orderId}`, { status });
        return response;
    } catch (error) {
        return { errCode: -1, message: error.message };
    }
};