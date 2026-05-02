import axios from "../setup/axios";

const loadCart = async (userId) => {
	try {
		const response = await axios.get(`/cart/${userId}`);
		return response;
	} catch (error) {
		console.error("Error loading cart:", error);
		throw error.response.data;
	}
};
const addToCart = async (userId, product_id, quantity = 1) => {
	try {
		const response = await axios.post('/addToCart', {
			user_id: userId,
			product_id: product_id,
			quantity: quantity,
		});
		return response;
	} catch (error) {
		console.error("Error adding to cart:", error);
		throw error.response.data;
	}
};
const removeFromCart = async (cart_id) => {
	try {
		const response = await axios.delete(`/delete_cart/${cart_id}`);
		return response;
	} catch (error) {
		console.error("Error removing from cart:", error);
		throw error.response.data;
	}
}

const checkOutStock = async (items) => {
	try {
		const response = await axios.post('/checkOutStock', { items });
		return response;
	} catch (error) {
		console.error("Error checking out stock:", error);
		throw error.response.data;
	}
}

const CheckPaymentZalopay = async (apptransid) => {
	return axios.post(
		"/checkPayment",
		{ app_trans_id: apptransid },
		{
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
};

const PaymentZaloPay = async (user) => {
	return axios.post("/create_order", user, {
		headers: {
			"Content-Type": "application/json",
		},
	});
};

const PaymentStripe = async (user) => {
	return axios.post("/create-checkout-session", user, {
		headers: {
			"Content-Type": "application/json",
		},
	});
};

const CheckPaymentStripe = async (session_id) => {
	return axios.post(
		"/check-payment",
		{ session_id: session_id },
		{
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
};

const CheckOut = async (orderData) => {
	return axios.post("/checkout", orderData, {
		headers: {
			"Content-Type": "application/json",
		},
	});
};
const GetOrdersData = async (user_id) => {
	return axios.get(`/orders/${user_id}`, {
		headers: {
			"Content-Type": "application/json",
		},
	});
};
const GetOrderDetail = async (order_id) => {
	return axios.get(`/order/${order_id}`, {
		headers: {
			"Content-Type": "application/json",
		},
	});
};
const GetOrderPayment = async (order_id) => {
	return axios.get(`/payment/${order_id}`, {
		headers: {
			"Content-Type": "application/json",
		},
	});
}
const CancelOrder = async (order_id) => {
	return axios.post(`/cancel_order/${order_id}`, {}, {
		headers: {
			"Content-Type": "application/json",
		},
	});
}

// Add product rating
const SubmitProductRating = async (ratingData) => {
	try {
		const response = await axios.post(
			`/product/rating`,
			ratingData
		);
		return response;
	} catch (error) {
		console.error("Error submitting product rating:", error);
		throw error;
	}
}

const GetProductReviews = async (product_id) => {
	try {
		const response = await axios.get(`/product/${product_id}/reviews`);
		return response;
	} catch (error) {
		console.error("Error getting product rating:", error);
		throw error;
	}
}

export {
	loadCart,
	addToCart,
	removeFromCart,
	checkOutStock,
	CheckPaymentZalopay,
	PaymentZaloPay,
	PaymentStripe,
	CheckPaymentStripe,
	CheckOut,
	GetOrdersData,
	GetOrderDetail,
	GetOrderPayment,
	CancelOrder,
	SubmitProductRating,
	GetProductReviews,
};
