import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckPaymentStripe } from "../../../services/apiService";
import "./CheckPayment.css";
import { CheckOut } from "../../../services/apiService";
import { toast } from 'react-toastify';
import { UserContext } from "../../../context/UserProvider";

const CheckPayment = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { fetchUser } = React.useContext(UserContext);

    useEffect(() => {
        const checkPayment = async () => {
            const params = new URLSearchParams(location.search);
            const session_id = params.get("session_id");

            if (!session_id) {
                navigate("/failPayment");
                return;
            }

            try {
                const response = await CheckPaymentStripe(session_id);
                if (response?.status === "success") {
                    const orderDataStr = localStorage.getItem("pendingOrderData");
                    if (!orderDataStr) {
                        navigate("/failPayment");
                        return;
                    }
                    const orderData = JSON.parse(orderDataStr);
                    orderData.session_id = session_id;
                    localStorage.removeItem("pendingOrderData");
                    const responseCheckout = await CheckOut(orderData);
                    if (responseCheckout && responseCheckout.errCode === 0) {
                        toast.success("Order placed successfully");
                        fetchUser();
                        setTimeout(() => navigate("/orders"), 500);
                    } else {
                        toast.error(responseCheckout?.message || "Order failed");
                        navigate("/failPayment");
                    }
                } else {
                    navigate("/failPayment");
                }
            } catch {
                navigate("/failPayment");
            }
        };
        checkPayment();
    }, [location, navigate]);

    return (
        <div className="check-payment-container">
            <div className="spinner"></div>
            <div>Checking payment status...</div>
        </div>
    );
};

export default CheckPayment;
