import React, { useState, useEffect, useContext } from "react";
import { toast } from "react-toastify";
import { PaymentZaloPay, PaymentStripe, CheckOut, checkOutStock } from "../../services/apiService.js";
import { validateCoupon } from "../../services/couponService.js";
import { UserContext } from "../../context/UserProvider";
import { useLocation, useNavigate } from "react-router-dom";
import {
    FaUser, FaEnvelope, FaPhone, FaGlobe, FaMapMarkerAlt,
    FaTags, FaCreditCard, FaMoneyBillWave, FaArrowRight,
    FaExclamationTriangle, FaTimes, FaShoppingBag
} from "react-icons/fa";
import "./Checkout.css";

const Checkout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, fetchUser } = useContext(UserContext);
    const formValue = location.state?.formValue || null;
    const [isLoading, setIsLoading] = useState(false);
    const [outOfStockModal, setOutOfStockModal] = useState({ open: false, items: [] });

    useEffect(() => {
        if (formValue === null) {
            navigate("/home");
        }
    }, [formValue, navigate]);

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        country: "Viet Nam",
        address: "",
        payment: "",
    });

    const [discountCode, setDiscountCode] = useState("");
    const [discount, setDiscount] = useState({
        applied: false,
        amount: 0,
        code: "",
        coupon_id: null,
    });
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
    const [totalAmount, setTotalAmount] = useState(formValue?.amount || 0);

    useEffect(() => {
        if (user?.account) {
            setFormData({
                name: user.account.name || '',
                email: user.account.email || '',
                phone: user.account.phone || '',
                country: "Viet Nam",
                address: user.account.address || ''
            });
        }
    }, [user]);

    useEffect(() => {
        if (formValue) {
            const newTotal = Number(formValue.amount) - discount.amount;
            setTotalAmount(newTotal > 0 ? newTotal : 0);
        }
    }, [discount, formValue]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handlePaymentChange = (method) => {
        setFormData({ ...formData, payment: method });
    };

    const applyDiscountCode = async () => {
        if (!discountCode.trim()) {
            toast.error("Vui lòng nhập mã giảm giá");
            return;
        }
        if (!user?.account?.id) {
            toast.error("Vui lòng đăng nhập để sử dụng mã giảm giá");
            return;
        }

        setIsApplyingCoupon(true);
        try {
            const res = await validateCoupon(
                discountCode.trim(),
                user.account.id,
                formValue?.amount || 0
            );

            if (res && res.errCode === 0) {
                setDiscount({
                    applied: true,
                    amount: res.discount_amount,
                    code: res.coupon.code,
                    coupon_id: res.coupon.id,
                });
                toast.success(`Mã giảm giá "${res.coupon.code}" đã được áp dụng!`);
            } else {
                toast.error(res?.message || "Mã giảm giá không hợp lệ");
            }
        } catch (err) {
            toast.error(err?.message || "Không thể kiểm tra mã giảm giá, thử lại sau");
        } finally {
            setIsApplyingCoupon(false);
        }
    };

    const removeDiscount = () => {
        setDiscount({
            applied: false,
            amount: 0,
            code: "",
            coupon_id: null,
        });
        setDiscountCode("");
        toast.info("Đã xóa mã giảm giá");
    };

    const handleSubmit = async () => {
        if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim() || !formData.address.trim()) {
            toast.error("Please fill in all billing details.");
            return;
        }

        if (!formData.payment) {
            toast.error("Please select a payment method.");
            return;
        }

        setIsLoading(true);

        // ── Check out-of-stock before processing order ──
        try {
            const checkOutStockRes = await checkOutStock(formValue.items);
            if (checkOutStockRes.errCode === 1) {
                setOutOfStockModal({ open: true, items: checkOutStockRes.outOfStock || [] });
                setIsLoading(false);
                return;
            } else if (checkOutStockRes.errCode !== 0) {
                toast.error("Stock check failed. Please try again.");
                setIsLoading(false);
                return;
            }
        } catch (error) {
            console.error('Error checking stock during checkout:', error);
            toast.error("Unable to verify stock. Please try again.");
            setIsLoading(false);
            return;
        }

        const orderData = {
            user_id: user.account.id,
            order_items: formValue.items.map((item) => ({
                cart_id: item.cart_id,
                product_id: item.product_id,
                quantity: item.quantity,
                total_price: Number(item.price) * item.quantity,
            })),
            isBuyNow: formValue.isBuyNow,
            total_amount: totalAmount,
            discount_amount: discount.amount,
            discount_code: discount.code,
            coupon_id: discount.coupon_id,
            payment_method: formData.payment,
            shipping_address: formData.address + ", " + formData.country,
        };

        if (formData.payment === "pay_later") {
            try {
                const response = await CheckOut(orderData);
                if (response && response.errCode === 0) {
                    toast.success("Order placed successfully! Redirecting to orders page...");
                    fetchUser();
                    setTimeout(() => navigate("/orders"), 2000);
                } else {
                    toast.error(response.message || "Failed to place order.");
                    setIsLoading(false);
                }
            } catch (error) {
                toast.error("Error while saving order information: " + error.message);
                setIsLoading(false);
            }
        } else if (formData.payment === "online_payment") {
            localStorage.setItem("pendingOrderData", JSON.stringify(orderData));
            try {
                let res = await PaymentStripe({
                    name: formData.name,
                    amount: totalAmount,
                });
                if (res && res.checkout_url) {
                    window.location.href = res.checkout_url;
                } else {
                    toast.error("Payment initialization failed.");
                    setIsLoading(false);
                }
            } catch (e) {
                toast.error("Error while processing payment");
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="cko__wrapper">
            {isLoading && (
                <div className="cko__loading-overlay">
                    <div className="cko__spinner"></div>
                    <p className="cko__loading-text">Processing your order securely...</p>
                </div>
            )}

            <div className="cko__container">
                <div className="cko__header">
                    <FaShoppingBag className="cko__header-icon" />
                    <div>
                        <h1 className="cko__title">Secure Checkout</h1>
                        <p className="cko__subtitle">Review your shipping info and complete your purchase</p>
                    </div>
                </div>

                <div className="cko__content">
                    {/* Billing Details */}
                    <div className="cko__billing">
                        <h2 className="cko__section-title">Shipping & Billing</h2>

                        <div className="cko__form-grid">
                            <div className="cko__form-group">
                                <label className="cko__label"><FaUser className="cko__input-icon" /> Full Name <span className="cko__required">*</span></label>
                                <input
                                    type="text"
                                    name="name"
                                    placeholder="Enter your full name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="cko__input"
                                />
                            </div>

                            <div className="cko__form-group">
                                <label className="cko__label"><FaEnvelope className="cko__input-icon" /> Email Address <span className="cko__required">*</span></label>
                                <input
                                    type="email"
                                    name="email"
                                    placeholder="Enter your email address"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    className="cko__input"
                                />
                            </div>

                            <div className="cko__form-group">
                                <label className="cko__label"><FaPhone className="cko__input-icon" /> Phone Number <span className="cko__required">*</span></label>
                                <input
                                    type="tel"
                                    name="phone"
                                    placeholder="Enter your phone number"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    required
                                    className="cko__input"
                                />
                            </div>

                            <div className="cko__form-group">
                                <label className="cko__label"><FaGlobe className="cko__input-icon" /> Country</label>
                                <input
                                    type="text"
                                    name="country"
                                    value={formData.country}
                                    disabled
                                    className="cko__input cko__input--disabled"
                                />
                            </div>

                            <div className="cko__form-group cko__form-group--full">
                                <label className="cko__label"><FaMapMarkerAlt className="cko__input-icon" /> Street Address <span className="cko__required">*</span></label>
                                <input
                                    type="text"
                                    name="address"
                                    placeholder="Enter your complete street address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    required
                                    className="cko__input"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div className="cko__summary">
                        <h2 className="cko__section-title">Order Summary</h2>

                        <div className="cko__products-list">
                            {formValue?.items.map((item) => (
                                <div className="cko__product-item" key={item.cart_id || item.product_id}>
                                    <div className="cko__product-info">
                                        <span className="cko__product-name">{item.title}</span>
                                        <span className="cko__product-quantity">x{item.quantity}</span>
                                    </div>
                                    <span className="cko__product-price">${(Number(item.price) * item.quantity).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>

                        {/* Discount Code Section */}
                        <div className="cko__discount">
                            <h3 className="cko__discount-title"><FaTags className="cko__discount-icon" /> Promo Code</h3>

                            {!discount.applied ? (
                                <div className="cko__discount-input-group">
                                    <input
                                        type="text"
                                        placeholder="Enter coupon code"
                                        value={discountCode}
                                        onChange={(e) => setDiscountCode(e.target.value)}
                                        className="cko__discount-input"
                                    />
                                    <button
                                        onClick={applyDiscountCode}
                                        className="cko__discount-button"
                                        disabled={isApplyingCoupon}
                                    >
                                        {isApplyingCoupon ? "Checking..." : "Apply"}
                                    </button>
                                </div>
                            ) : (
                                <div className="cko__discount-applied">
                                    <div className="cko__discount-info">
                                        <span className="cko__discount-code">{discount.code}</span>
                                        <span className="cko__discount-value">-${discount.amount.toFixed(2)}</span>
                                    </div>
                                    <button
                                        onClick={removeDiscount}
                                        className="cko__discount-remove"
                                    >
                                        Remove
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Totals */}
                        <div className="cko__totals">
                            <div className="cko__total-row">
                                <span>Subtotal</span>
                                <span>${Number(formValue?.amount).toFixed(2)}</span>
                            </div>

                            {discount.applied && (
                                <div className="cko__total-row cko__total-row--discount">
                                    <span>Discount ({discount.code})</span>
                                    <span>-${discount.amount.toFixed(2)}</span>
                                </div>
                            )}

                            <div className="cko__total-row cko__total-row--final">
                                <span>Total Amount</span>
                                <span>${Number(totalAmount).toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Payment Methods */}
                        <div className="cko__payment-methods">
                            <h3 className="cko__payment-title"><FaCreditCard className="cko__payment-title-icon" /> Payment Method</h3>

                            <div className="cko__payment-options">
                                <label
                                    className={`cko__payment-option${formData.payment === "pay_later" ? " cko__payment-option--selected" : ""}`}
                                    onClick={() => handlePaymentChange("pay_later")}
                                >
                                    <div className="cko__option-header">
                                        <input
                                            type="radio"
                                            name="payment"
                                            checked={formData.payment === "pay_later"}
                                            onChange={() => { }}
                                            className="cko__payment-radio"
                                        />
                                        <span className="cko__payment-name"><FaMoneyBillWave className="cko__method-icon" /> Cash on Delivery (COD)</span>
                                    </div>
                                    <p className="cko__payment-desc">Pay cash securely when your order is delivered.</p>
                                </label>

                                <label
                                    className={`cko__payment-option${formData.payment === "online_payment" ? " cko__payment-option--selected" : ""}`}
                                    onClick={() => handlePaymentChange("online_payment")}
                                >
                                    <div className="cko__option-header">
                                        <input
                                            type="radio"
                                            name="payment"
                                            checked={formData.payment === "online_payment"}
                                            onChange={() => { }}
                                            className="cko__payment-radio"
                                        />
                                        <span className="cko__payment-name"><FaCreditCard className="cko__method-icon" /> Pay online via Stripe</span>
                                    </div>
                                    <p className="cko__payment-desc">Pay instantly using credit or debit cards securely via Stripe.</p>
                                </label>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            onClick={handleSubmit}
                            className="cko__submit-btn"
                        >
                            Place Order <FaArrowRight className="cko__btn-arrow" />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Out-of-Stock Modal ── */}
            {outOfStockModal.open && (
                <div className="cko__modal-overlay" onClick={() => setOutOfStockModal({ open: false, items: [] })}>
                    <div className="cko__modal" onClick={(e) => e.stopPropagation()}>
                        <div className="cko__modal-header">
                            <FaExclamationTriangle className="cko__modal-icon" />
                            <h3>Some products are out of stock</h3>
                            <button
                                className="cko__modal-close"
                                onClick={() => setOutOfStockModal({ open: false, items: [] })}
                            >
                                <FaTimes />
                            </button>
                        </div>
                        <p className="cko__modal-desc">
                            We apologize, but some components in your order just became unavailable or have insufficient stock. Please modify your cart to continue.
                        </p>
                        <ul className="cko__modal-list">
                            {outOfStockModal.items.map((oos) => (
                                <li key={oos.product_id} className="cko__modal-item">
                                    <span className="cko__modal-item-name">{oos.title}</span>
                                    <span className="cko__modal-item-stock">
                                        Requested: <strong>{oos.requested_quantity}</strong> &nbsp;·&nbsp; Available: <strong>{oos.available_stock}</strong>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <button
                            className="cko__modal-btn"
                            onClick={() => {
                                setOutOfStockModal({ open: false, items: [] });
                                navigate("/cart");
                            }}
                        >
                            Back to Cart
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Checkout;