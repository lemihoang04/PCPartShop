import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import './OrderDetailModal.css';
import { GetOrderDetail, GetOrderPayment, GetOrderStatusHistory } from '../../services/apiService';

const OrderDetailModal = ({ order, onClose }) => {
    const [orderDetails, setOrderDetails] = useState(null);
    const [paymentDetails, setPaymentDetails] = useState(null);
    const [statusHistory, setStatusHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Format date
    const formatDate = (dateString) => {
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        return new Date(dateString).toLocaleDateString(undefined, options);
    };

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    // Get status class
    const getStatusClass = (status) => {
        if (!status) return 'odtm__status-default';
        const statusMap = {
            'pending': 'odtm__status-pending',
            'processing': 'odtm__status-processing',
            'shipped': 'odtm__status-shipped',
            'delivered': 'odtm__status-delivered',
            'cancelled': 'odtm__status-cancelled',
            'completed': 'odtm__status-completed'
        };
        return statusMap[status.toLowerCase()] || 'odtm__status-default';
    };

    // Get payment status class
    const getPaymentStatusClass = (status) => {
        if (!status) return 'odtm__payment-default';
        const statusMap = {
            'pending': 'odtm__payment-pending',
            'completed': 'odtm__payment-completed',
            'failed': 'odtm__payment-failed',
            'refunded': 'odtm__payment-refunded'
        };
        return statusMap[status.toLowerCase()] || 'odtm__payment-default';
    };

    // Fetch payment details only, order is from props
    useEffect(() => {
        const fetchPaymentDetails = async () => {
            try {
                setLoading(true);
                if (!order || !order.order_id) {
                    setError('Order information is missing.');
                    setLoading(false);
                    return;
                }
                setOrderDetails(order); // set order from props

                const paymentResponse = await GetOrderPayment(order.order_id);
                if (paymentResponse.errCode !== 0) throw new Error('Failed to fetch payment details');
                const paymentData = paymentResponse.data;

                setPaymentDetails(paymentData);

                try {
                    const historyResponse = await GetOrderStatusHistory(order.order_id);
                    if (historyResponse.errCode === 0) {
                        setStatusHistory(historyResponse.data || []);
                    }
                } catch (historyErr) {
                    console.error('Error fetching history:', historyErr);
                }
            } catch (err) {
                console.error('Error fetching payment details:', err);
                setError('Failed to load order details. Please try again later.');
                toast.error('Failed to load order details');
            } finally {
                setLoading(false);
            }
        };

        if (order && order.order_id) {
            fetchPaymentDetails();
        }
    }, [order]);

    // Handle click outside to close
    const handleClickOutside = (e) => {
        if (e.target.className === 'odtm__modal-backdrop') {
            onClose();
        }
    };

    // Render loading state
    if (loading) {
        return (
            <div className="odtm__modal-backdrop" onClick={handleClickOutside}>
                <div className="odtm__modal-content">
                    <div className="odtm__loader">
                        <div className="odtm__spinner"></div>
                        <p>Loading order details...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Render error state
    if (error) {
        return (
            <div className="odtm__modal-backdrop" onClick={handleClickOutside}>
                <div className="odtm__modal-content">
                    <div className="odtm__error">
                        <h3>Error</h3>
                        <p>{error}</p>
                        <button className="odtm__button odtm__button-primary" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        );
    }

    // Render when no data
    if (!orderDetails || !paymentDetails) {
        return (
            <div className="odtm__modal-backdrop" onClick={handleClickOutside}>
                <div className="odtm__modal-content">
                    <div className="odtm__not-found">
                        <h3>Order Not Found</h3>
                        <p>The requested order details could not be found.</p>
                        <button className="odtm__button odtm__button-primary" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="odtm__modal-backdrop" onClick={handleClickOutside}>
            <div className="odtm__modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="odtm__modal-header">
                    <h2>Order Details</h2>
                    <button className="odtm__close-button" onClick={onClose}>&times;</button>
                </div>

                <div className="odtm__modal-body">
                    <div className="odtm__order-summary">
                        <div className="odtm__order-header">
                            <div>
                                <h3>Order #{orderDetails.order_id}</h3>
                                <p className="odtm__order-date"><strong>Placed on:</strong> {formatDate(orderDetails.date)}
                                    <br />
                                    {
                                        (orderDetails.status === 'completed' || orderDetails.status === 'cancelled') && (
                                            <span><strong>{orderDetails.status.charAt(0).toUpperCase() + orderDetails.status.slice(1)} on:</strong> {formatDate(orderDetails.updated_at)}</span>
                                        )
                                    }
                                </p>

                            </div>
                            <div className={`odtm__status ${getStatusClass(orderDetails.status)}`}>
                                {orderDetails.status ? (orderDetails.status.charAt(0).toUpperCase() + orderDetails.status.slice(1)) : 'Unknown'}
                            </div>
                        </div>
                        {statusHistory && statusHistory.length > 0 && (
                            <>
                                <div className="odtm__shipping-section">
                                    <h4>Order Status History</h4>
                                    <div className="odtm__shipping-timeline">
                                        {statusHistory.map((history, index) => (
                                            <div className="odtm__timeline-item" key={history.id || index}>
                                                <div className={`odtm__timeline-dot ${index === 0 ? 'odtm__active' : ''}`}></div>
                                                <div className="odtm__timeline-content">
                                                    <h5>{history.status ? (history.status.charAt(0).toUpperCase() + history.status.slice(1)) : 'Unknown'}</h5>
                                                    <p>{history.note || 'No additional note'}</p>
                                                    <p className="odtm__timeline-date">{formatDate(history.created_at)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </>
                        )}
                        <div className="odtm__divider"></div>

                        <div className="odtm__product-section">
                            <h4>Product</h4>
                            <div className="odtm__product-details">
                                <div className="odtm__product-image">
                                    <img src={orderDetails.productImage?.split("; ")[0] || 'https://via.placeholder.com/80'}
                                        alt={orderDetails.title} />
                                </div>
                                <div className="odtm__product-info">
                                    <h5 className="odtm__product-title">{orderDetails.title}</h5>
                                    <p className="odtm__product-price">Price: {formatCurrency(orderDetails.price)}</p>
                                    <p className="odtm__product-quantity">Quantity: {orderDetails.quantity}</p>
                                </div>
                            </div>
                        </div>

                        <div className="odtm__divider"></div>

                        <div className="odtm__pricing-section">
                            <h4>Price Details</h4>
                            <div className="odtm__price-breakdown">
                                <div className="odtm__price-row">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(orderDetails.price * orderDetails.quantity)}</span>
                                </div>
                                <div className="odtm__price-row">
                                    <span>Shipping</span>
                                    <span>Free</span>
                                </div>
                                <div className="odtm__price-row">
                                    <span>Tax</span>
                                    <span>{formatCurrency(orderDetails.price * orderDetails.quantity * 0.08)}</span>
                                </div>
                                <div className="odtm__price-row odtm__total">
                                    <span>Total</span>
                                    <span>{formatCurrency(
                                        orderDetails.price * orderDetails.quantity +
                                        (orderDetails.price * orderDetails.quantity * 0.08)
                                    )}</span>
                                </div>
                            </div>
                        </div>

                        <div className="odtm__divider"></div>

                        {/* <div className="odtm__shipping-section">
                            <h4>Shipping Details</h4>
                            <p className="odtm__shipping-address">{orderDetails.shipping_address}</p>
                            <div className="odtm__shipping-timeline">
                                <div className="odtm__timeline-item">
                                    <div className="odtm__timeline-dot odtm__active"></div>
                                    <div className="odtm__timeline-content">
                                        <h5>Order Placed</h5>
                                        <p>{formatDate(orderDetails.created_at)}</p>
                                    </div>
                                </div>
                                <div className="odtm__timeline-item">
                                    <div className={`odtm__timeline-dot ${orderDetails.status !== 'pending' ? 'odtm__active' : ''}`}></div>
                                    <div className="odtm__timeline-content">
                                        <h5>Processing</h5>
                                        <p>{orderDetails.status !== 'pending' ? 'Your order is being processed' : 'Pending'}</p>
                                    </div>
                                </div>
                                <div className="odtm__timeline-item">
                                    <div className={`odtm__timeline-dot ${orderDetails.status === 'shipped' || orderDetails.status === 'delivered' ? 'odtm__active' : ''}`}></div>
                                    <div className="odtm__timeline-content">
                                        <h5>Shipped</h5>
                                        <p>{orderDetails.status === 'shipped' || orderDetails.status === 'delivered' ? 'Your order has been shipped' : 'Waiting'}</p>
                                    </div>
                                </div>
                                <div className="odtm__timeline-item">
                                    <div className={`odtm__timeline-dot ${orderDetails.status === 'delivered' ? 'odtm__active' : ''}`}></div>
                                    <div className="odtm__timeline-content">
                                        <h5>Delivered</h5>
                                        <p>{orderDetails.status === 'delivered' ? 'Your order has been delivered' : 'Waiting'}</p>
                                    </div>
                                </div>
                            </div>
                        </div> */}



                        <div className="odtm__payment-section">
                            <h4>Payment Information</h4>
                            <div className="odtm__payment-details">
                                <div className="odtm__payment-row">
                                    <span>Payment ID</span>
                                    <span>#{paymentDetails.payment_id}</span>
                                </div>
                                <div className="odtm__payment-row">
                                    <span>Method</span>
                                    <span>{paymentDetails.payment_method}</span>
                                </div>
                                <div className="odtm__payment-row">
                                    <span>Amount</span>
                                    <span>{formatCurrency(paymentDetails.amount)}</span>
                                </div>
                                <div className="odtm__payment-row">
                                    <span>Status</span>
                                    <span className={`odtm__payment-status ${getPaymentStatusClass(paymentDetails.payment_status)}`}>
                                        {paymentDetails.payment_status ? (paymentDetails.payment_status.charAt(0).toUpperCase() + paymentDetails.payment_status.slice(1)) : 'Unknown'}
                                    </span>
                                </div>
                                <div className="odtm__payment-row">
                                    <span>Date</span>
                                    <span>{formatDate(paymentDetails.created_at)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="odtm__modal-footer">
                    <div className="odtm__footer-actions">
                        {(orderDetails.status === 'pending' || orderDetails.status === 'processing') && (
                            <button className="odtm__button odtm__button-danger">Cancel Order</button>
                        )}
                        <button className="odtm__button odtm__button-secondary" onClick={onClose}>Close</button>
                        {orderDetails.status === 'delivered' && (
                            <button className="odtm__button odtm__button-primary">Leave Review</button>
                        )}
                    </div>
                    <p className="odtm__customer-support">
                        Need help? <a href="#">Contact Customer Support</a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default OrderDetailModal;