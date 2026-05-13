import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import './OrderDetailModal.css';
import { GetOrderPayment, GetOrderStatusHistory } from '../../services/apiService';
import { 
    FaTimes, FaBox, FaCreditCard, FaHistory, FaCalendarAlt, 
    FaCheckCircle, FaClock, FaTruck, FaCog, FaBan, FaHashtag,
    FaExclamationCircle, FaCircle, FaGlobe, FaHandHoldingUsd
} from 'react-icons/fa';

const STATUS_CONFIG = {
    pending:    { icon: <FaClock />,       label: 'Pending',    cls: 'pending' },
    processing: { icon: <FaCog />,         label: 'Processing', cls: 'processing' },
    shipped:    { icon: <FaTruck />,       label: 'Shipped',    cls: 'shipped' },
    completed:  { icon: <FaCheckCircle />, label: 'Completed',  cls: 'completed' },
    delivered:  { icon: <FaCheckCircle />, label: 'Delivered',  cls: 'delivered' },
    cancelled:  { icon: <FaBan />,         label: 'Cancelled',  cls: 'cancelled' },
};

const PAYMENT_STATUS_CONFIG = {
    pending:    { icon: <FaClock />,       label: 'Pending',    cls: 'pending' },
    completed:  { icon: <FaCheckCircle />, label: 'Completed',  cls: 'completed' },
    paid:       { icon: <FaCheckCircle />, label: 'Paid',       cls: 'completed' },
    unpaid:     { icon: <FaClock />,       label: 'Unpaid',     cls: 'pending' },
    failed:     { icon: <FaExclamationCircle />, label: 'Failed', cls: 'failed' },
    refunded:   { icon: <FaBan />,         label: 'Refunded',   cls: 'refunded' },
};

const PAYMENT_METHOD_CONFIG = {
    online_payment: { icon: <FaGlobe />, label: 'Online Payment', cls: 'online' },
    pay_later:      { icon: <FaHandHoldingUsd />, label: 'Pay Later', cls: 'later' },
};

const OrderDetailModal = ({ order, onClose }) => {
    const [orderDetails, setOrderDetails] = useState(null);
    const [paymentDetails, setPaymentDetails] = useState(null);
    const [statusHistory, setStatusHistory] = useState([]);
    const [showFullHistory, setShowFullHistory] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Format date
    const formatDate = (dateString) => {
        const options = {
            year: 'numeric',
            month: 'short',
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
                        <FaExclamationCircle className="odtm__error-icon" />
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
                        <FaBox className="odtm__not-found-icon" />
                        <h3>Order Not Found</h3>
                        <p>The requested order details could not be found.</p>
                        <button className="odtm__button odtm__button-primary" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        );
    }

    const orderStatus = orderDetails.status?.toLowerCase();
    const sc = STATUS_CONFIG[orderStatus] || { icon: <FaCircle />, label: orderStatus, cls: 'default' };
    
    const paymentStatus = paymentDetails.payment_status?.toLowerCase();
    const psc = PAYMENT_STATUS_CONFIG[paymentStatus] || { icon: <FaCircle />, label: paymentStatus, cls: 'default' };

    const paymentMethod = paymentDetails.payment_method?.toLowerCase();
    const pmc = PAYMENT_METHOD_CONFIG[paymentMethod] || { icon: <FaCircle />, label: paymentMethod, cls: 'default' };

    return (
        <div className="odtm__modal-backdrop" onClick={handleClickOutside}>
            <div className="odtm__modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="odtm__modal-header">
                    <h2><FaBox className="odtm__header-icon" /> Order Details</h2>
                    <button className="odtm__close-button" onClick={onClose}><FaTimes /></button>
                </div>

                <div className="odtm__modal-body">
                    <div className="odtm__order-summary">
                        {/* Order Header */}
                        <div className="odtm__order-header-card">
                            <div className="odtm__order-meta-info">
                                <h3 className="odtm__order-id"><FaHashtag /> {orderDetails.order_id}</h3>
                                <div className="odtm__order-dates">
                                    <span className="odtm__date-item">
                                        <FaCalendarAlt /> <strong>Placed:</strong> {formatDate(orderDetails.date)}
                                    </span>
                                    {(orderDetails.status === 'completed' || orderDetails.status === 'cancelled') && (
                                        <span className="odtm__date-item">
                                            <FaClock /> <strong>Updated:</strong> {formatDate(orderDetails.updated_at)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className={`odtm__status-badge odtm__status-${sc.cls}`}>
                                {sc.icon} {sc.label || 'Unknown'}
                            </div>
                        </div>

                        {/* Status History */}
                        {statusHistory && statusHistory.length > 0 && (
                            <div className="odtm__section odtm__history-section">
                                <h4><FaHistory className="odtm__section-icon"/> Order Status History</h4>
                                <div className="odtm__timeline">
                                    {(showFullHistory ? statusHistory : statusHistory.slice(0, 1)).map((history, index) => {
                                        const hsc = STATUS_CONFIG[history.status?.toLowerCase()] || { icon: <FaCircle />, cls: 'default' };
                                        return (
                                            <div className="odtm__timeline-item" key={history.id || index}>
                                                <div className={`odtm__timeline-dot odtm__status-color-${hsc.cls} ${index === 0 ? 'odtm__active' : ''}`}></div>
                                                <div className="odtm__timeline-content">
                                                    <h5>{history.status ? (history.status.charAt(0).toUpperCase() + history.status.slice(1)) : 'Unknown'}</h5>
                                                    <p className="odtm__timeline-note">{history.note || 'No additional note'}</p>
                                                    <p className="odtm__timeline-date">{formatDate(history.created_at)}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {statusHistory.length > 1 && (
                                        <button 
                                            className="odtm__view-more-btn" 
                                            onClick={() => setShowFullHistory(!showFullHistory)}
                                        >
                                            {showFullHistory ? "Show Less" : `View More (${statusHistory.length - 1} earlier states)`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="odtm__section-grid">
                            {/* Product Section */}
                            <div className="odtm__section odtm__product-section">
                                <h4><FaBox className="odtm__section-icon"/> Product</h4>
                                <div className="odtm__product-card">
                                    <div className="odtm__product-image">
                                        <img src={orderDetails.productImage?.split("; ")[0] || '/default-image.jpg'}
                                            alt={orderDetails.title} 
                                            onError={e => { e.target.src = '/default-image.jpg'; }} />
                                    </div>
                                    <div className="odtm__product-info">
                                        <h5 className="odtm__product-title">{orderDetails.title}</h5>
                                        <div className="odtm__product-meta">
                                            <span className="odtm__product-price">{formatCurrency(orderDetails.price)}</span>
                                            <span className="odtm__product-quantity">Qty: {orderDetails.quantity}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Price Details moved inside Product Section for better layout */}
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
                                        <span className="odtm__total-amount">{formatCurrency(
                                            orderDetails.price * orderDetails.quantity +
                                            (orderDetails.price * orderDetails.quantity * 0.08)
                                        )}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Payment Section */}
                            <div className="odtm__section odtm__payment-section">
                                <h4><FaCreditCard className="odtm__section-icon"/> Payment Info</h4>
                                <div className="odtm__payment-card">
                                    <div className="odtm__payment-row">
                                        <span className="odtm__payment-label">Payment ID</span>
                                        <span className="odtm__payment-value">#{paymentDetails.payment_id}</span>
                                    </div>
                                    <div className="odtm__payment-row">
                                        <span className="odtm__payment-label">Method</span>
                                        <div className={`odtm__method-badge odtm__method-${pmc.cls}`}>
                                            {pmc.icon} {pmc.label || 'Unknown'}
                                        </div>
                                    </div>
                                    <div className="odtm__payment-row">
                                        <span className="odtm__payment-label">Amount</span>
                                        <span className="odtm__payment-value odtm__payment-amount">{formatCurrency(paymentDetails.amount)}</span>
                                    </div>
                                    <div className="odtm__payment-row">
                                        <span className="odtm__payment-label">Date</span>
                                        <span className="odtm__payment-value">{formatDate(paymentDetails.created_at)}</span>
                                    </div>
                                    <div className="odtm__payment-row odtm__payment-status-row">
                                        <span className="odtm__payment-label">Status</span>
                                        <div className={`odtm__status-badge odtm__payment-status-${psc.cls}`}>
                                            {psc.icon} {psc.label || 'Unknown'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="odtm__modal-footer">
                    <p className="odtm__customer-support">
                        Need help? <a href="#">Contact Support</a>
                    </p>
                    <div className="odtm__footer-actions">
                        {(orderDetails.status === 'pending' || orderDetails.status === 'processing') && (
                            <button className="odtm__button odtm__button-danger">Cancel Order</button>
                        )}
                        <button className="odtm__button odtm__button-primary" onClick={onClose}>Done</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetailModal;