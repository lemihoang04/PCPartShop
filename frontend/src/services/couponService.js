import axios from "../setup/axios";

/**
 * Validate a coupon code before applying it.
 * Does NOT record usage – usage is recorded only after successful payment.
 *
 * @param {string} code         - Coupon code entered by the user
 * @param {number} userId       - Logged-in user's id
 * @param {number} orderAmount  - Current order total (before discount)
 * @returns Promise<{ errCode, message, coupon, discount_amount }>
 */
const validateCoupon = async (code, userId, orderAmount) => {
    try {
        const response = await axios.post("/coupons/validate", {
            code,
            user_id: userId,
            order_amount: orderAmount,
        });
        return response;
    } catch (error) {
        console.error("Error validating coupon:", error);
        throw error?.response?.data ?? error;
    }
};

/**
 * Fetch all coupons (admin panel use).
 * @returns Promise<{ errCode, data: Coupon[] }>
 */
const getAllCoupons = async () => {
    try {
        const response = await axios.get("/coupons");
        return response;
    } catch (error) {
        console.error("Error fetching coupons:", error);
        throw error?.response?.data ?? error;
    }
};

/**
 * Fetch a single coupon by id.
 * @param {number} couponId
 */
const getCouponById = async (couponId) => {
    try {
        const response = await axios.get(`/coupons/${couponId}`);
        return response;
    } catch (error) {
        console.error("Error fetching coupon:", error);
        throw error?.response?.data ?? error;
    }
};

/**
 * Create a new coupon (admin).
 * @param {Object} couponData - { code, discount_type, discount_value, max_discount,
 *                               min_order_value, usage_limit, start_date, end_date, is_active }
 */
const createCoupon = async (couponData) => {
    try {
        const response = await axios.post("/coupons", couponData);
        return response;
    } catch (error) {
        console.error("Error creating coupon:", error);
        throw error?.response?.data ?? error;
    }
};

/**
 * Update an existing coupon (admin).
 * @param {number} couponId
 * @param {Object} couponData
 */
const updateCoupon = async (couponId, couponData) => {
    try {
        const response = await axios.put(`/coupons/${couponId}`, couponData);
        return response;
    } catch (error) {
        console.error("Error updating coupon:", error);
        throw error?.response?.data ?? error;
    }
};

/**
 * Delete a coupon (admin).
 * @param {number} couponId
 */
const deleteCoupon = async (couponId) => {
    try {
        const response = await axios.delete(`/coupons/${couponId}`);
        return response;
    } catch (error) {
        console.error("Error deleting coupon:", error);
        throw error?.response?.data ?? error;
    }
};

export {
    validateCoupon,
    getAllCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    deleteCoupon,
};
