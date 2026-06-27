import axios from "../setup/axios";
import axiosRaw from "axios"; // standard axios for Cloudinary

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dptatoir3/image/upload";
const UPLOAD_PRESET = "my_preset";

/** Upload một file ảnh lên Cloudinary, trả về secure_url */
export const uploadImageToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    const res = await axiosRaw.post(CLOUDINARY_URL, formData);
    return res.data.secure_url;
};

/**
 * Tạo return request (REFUND hoặc EXCHANGE)
 * @param {{ order_item_id, request_type, reason, images }} data
 */
export const CreateReturnRequest = async (data) => {
    try {
        const response = await axios.post("/return-requests", data);
        return response;
    } catch (error) {
        console.error("Error creating return request:", error);
        throw error;
    }
};

/** Lấy danh sách return requests của user */
export const GetReturnRequestsByUser = async (userId) => {
    try {
        const response = await axios.get(`/return-requests/user/${userId}`);
        return response;
    } catch (error) {
        console.error("Error fetching return requests:", error);
        throw error;
    }
};

/** Lấy chi tiết một return request */
export const GetReturnRequestById = async (requestId) => {
    try {
        const response = await axios.get(`/return-requests/${requestId}`);
        return response;
    } catch (error) {
        console.error("Error fetching return request:", error);
        throw error;
    }
};

/** Huỷ return request (chỉ khi PENDING) */
export const CancelReturnRequest = async (requestId) => {
    try {
        const response = await axios.post(`/return-requests/${requestId}/cancel`);
        return response;
    } catch (error) {
        console.error("Error cancelling return request:", error);
        throw error;
    }
};
