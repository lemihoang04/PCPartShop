import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../../context/UserProvider';
import { toast } from 'react-toastify';
import {
    GetOrdersData,
    CancelOrder,
    SubmitProductRating,
    GetOrderReviewStatus,
} from '../../services/apiService';
import {
    FaBoxOpen,
    FaCalendarAlt,
    FaHashtag,
    FaStar,
    FaTimesCircle,
    FaEye,
    FaSortAmountDown,
    FaSortAmountUp,
    FaShoppingBag,
    FaCheckCircle,
    FaClock,
    FaTruck,
    FaCog,
    FaBan,
} from 'react-icons/fa';
import OrderDetailModal from './OrderDetailModal';
import RatingModal from './RatingModal';
import './Orders.css';

const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
};

const STATUS_CONFIG = {
    pending:    { icon: <FaClock />,       label: 'Pending',    cls: 'pending' },
    processing: { icon: <FaCog />,         label: 'Processing', cls: 'processing' },
    shipped:    { icon: <FaTruck />,       label: 'Shipped',    cls: 'shipped' },
    completed:  { icon: <FaCheckCircle />, label: 'Completed',  cls: 'completed' },
    delivered:  { icon: <FaCheckCircle />, label: 'Delivered',  cls: 'delivered' },
    cancelled:  { icon: <FaBan />,         label: 'Cancelled',  cls: 'cancelled' },
};

const FILTERS = [
    { key: 'all',        label: 'All' },
    { key: 'pending',    label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'shipped',    label: 'Shipped' },
    { key: 'completed',  label: 'Completed' },
    { key: 'cancelled',  label: 'Cancelled' },
];

const Orders = () => {
    const navigate = useNavigate();
    const { user } = useContext(UserContext);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [sortBy, setSortBy] = useState('date');
    const [sortOrder, setSortOrder] = useState('desc');
    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [showRatingModal, setShowRatingModal] = useState(false);
    const [selectedOrderForRating, setSelectedOrderForRating] = useState(null);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            setOrders([]);
            const response = await GetOrdersData(user.account.id);
            if (response && response.errCode === 0) {
                const mapped = (response.orders || []).map(item => ({
                    id: item.id,
                    order_id: item.order_id,
                    orderNumber: `ORD-${item.order_id}`,
                    userId: item.user_id,
                    date: item.created_at || new Date().toISOString(),
                    updated_at: item.updated_at || new Date().toISOString(),
                    status: (item.status || '').trim().toLowerCase(),
                    productId: item.product_id,
                    title: item.title,
                    productImage: item.image,
                    price: item.price,
                    quantity: item.quantity,
                    total: item.price * item.quantity,
                    is_reviewed: !!item.is_reviewed,
                }));
                setOrders(mapped);
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            toast.error('Failed to load orders.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        return () => setOrders([]);
    }, [user, navigate]);

    const filteredOrders = orders.filter(order =>
        filter === 'all' || order.status === filter
    );

    const sortedOrders = [...filteredOrders].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'date')   cmp = new Date(a.date) - new Date(b.date);
        if (sortBy === 'total')  cmp = a.total - b.total;
        if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
        return sortOrder === 'desc' ? -cmp : cmp;
    });

    const getProductImage = (order) => {
        if (!order.productImage) return '/default-image.jpg';
        return order.productImage.split('; ')[0];
    };

    const openOrderDetails = (order) => {
        setSelectedOrderId({ id: order.id, order_id: order.order_id });
        setShowModal(true);
    };
    const closeOrderDetails = () => { setShowModal(false); setSelectedOrderId(null); };

    const handleCancel = async (order) => {
        if (!window.confirm('Are you sure you want to cancel this order?')) return;
        try {
            const response = await CancelOrder(order.id);
            if (response && response.errCode === 0) {
                toast.success(`Order ${order.orderNumber} cancelled.`);
                await fetchOrders();
            } else {
                toast.error(`Failed to cancel order ${order.orderNumber}.`);
            }
        } catch (error) {
            toast.error(`Error: ${error.message}`);
        }
    };

    const openRatingModal = (order) => {
        setSelectedOrderForRating(order);
        setShowRatingModal(true);
    };
    const closeRatingModal = () => { setShowRatingModal(false); setSelectedOrderForRating(null); };

    const handleRatingSubmit = async (ratingData) => {
        try {
            const response = await SubmitProductRating(ratingData);
            if (response && response.errCode === 0) {
                // Update local orders list to reflect the new reviewed status
                setOrders(prev => prev.map(o => 
                    o.id === selectedOrderForRating.id ? { ...o, is_reviewed: true } : o
                ));
            }
            return response;
        } catch (error) {
            console.error('Error submitting rating:', error);
            throw error;
        }
    };

    if (loading) {
        return (
            <div className="odrs__container">
                <div className="odrs__loading">
                    <div className="odrs__loading-spinner" />
                    <p>Loading your orders…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="odrs__container">
            {/* ── Header ── */}
            <div className="odrs__header">
                <div className="odrs__header-left">
                    <FaShoppingBag className="odrs__header-icon" />
                    <h1 className="odrs__title">My Orders</h1>
                </div>
                <span className="odrs__count-badge">
                    {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
                </span>
            </div>

            {/* ── Controls ── */}
            <div className="odrs__controls">
                <div className="odrs__filters">
                    {FILTERS.map(f => (
                        <button
                            key={f.key}
                            className={`odrs__filter-btn${filter === f.key ? ' odrs__active' : ''}`}
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div className="odrs__sort">
                    <select
                        className="odrs__sort-select"
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                    >
                        <option value="date">Date</option>
                        <option value="total">Total</option>
                        <option value="status">Status</option>
                    </select>
                    <button
                        className="odrs__sort-dir"
                        onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')}
                        title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {sortOrder === 'asc' ? <FaSortAmountUp /> : <FaSortAmountDown />}
                    </button>
                </div>
            </div>

            {/* ── List ── */}
            {sortedOrders.length === 0 ? (
                <div className="odrs__empty">
                    <FaBoxOpen className="odrs__empty-icon" />
                    <h3>No orders found</h3>
                    {filter !== 'all'
                        ? <p>Try a different filter.</p>
                        : <>
                            <p>You haven't placed any orders yet.</p>
                            <button className="odrs__btn odrs__btn-primary" onClick={() => navigate('/laptops')}>
                                Shop Now
                            </button>
                        </>
                    }
                </div>
            ) : (
                <div className="odrs__list">
                    {sortedOrders.map(order => {
                        const sc = STATUS_CONFIG[order.status] || { icon: null, label: order.status, cls: '' };
                        const isReviewed = order.is_reviewed;

                        return (
                            <div key={order.id} className="odrs__card">
                                {/* Card header */}
                                <div className="odrs__card-head">
                                    <div className="odrs__card-meta">
                                        <span className="odrs__meta-item">
                                            <FaHashtag className="odrs__meta-icon" />
                                            <strong>{order.orderNumber}</strong>
                                        </span>
                                        <span className="odrs__divider" />
                                        <span className="odrs__meta-item">
                                            <FaCalendarAlt className="odrs__meta-icon" />
                                            {formatDate(order.date)}
                                        </span>
                                    </div>
                                    <span className={`odrs__status odrs__status-${sc.cls}`}>
                                        {sc.icon}
                                        {sc.label}
                                    </span>
                                </div>

                                {/* Product row */}
                                <div className="odrs__product-row">
                                    <div className="odrs__thumb">
                                        <img
                                            src={getProductImage(order)}
                                            alt={order.title || 'Product'}
                                            onError={e => { e.target.src = '/default-image.jpg'; }}
                                        />
                                    </div>
                                    <div className="odrs__product-body">
                                        <p 
                                            className="odrs__product-name"
                                            onClick={() => navigate(`/product-info/${order.productId}`)}
                                        >
                                            {order.title || 'Product'}
                                        </p>
                                        <div className="odrs__product-foot">
                                            <span className="odrs__qty">Qty: {order.quantity}</span>
                                            <span className="odrs__price">${(order.total || 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="odrs__actions">
                                    <button
                                        className="odrs__btn odrs__btn-primary"
                                        onClick={() => openOrderDetails(order)}
                                    >
                                        <FaEye /> View Details
                                    </button>

                                    {order.status === 'pending' && (
                                        <button
                                            className="odrs__btn odrs__btn-danger"
                                            onClick={() => handleCancel(order)}
                                        >
                                            <FaTimesCircle /> Cancel
                                        </button>
                                    )}

                                    {order.status === 'completed' && !isReviewed && (
                                        <button
                                            className="odrs__btn odrs__btn-rate"
                                            onClick={() => openRatingModal(order)}
                                        >
                                            <FaStar /> Rate Product
                                        </button>
                                    )}

                                    {order.status === 'completed' && isReviewed && (
                                        <span className="odrs__reviewed-badge">
                                            <FaCheckCircle /> Reviewed
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && selectedOrderId && (
                <OrderDetailModal
                    order={orders.find(o => o.id === selectedOrderId.id)}
                    onClose={closeOrderDetails}
                />
            )}

            {showRatingModal && selectedOrderForRating && (
                <RatingModal
                    order={selectedOrderForRating}
                    onClose={closeRatingModal}
                    onSubmit={handleRatingSubmit}
                />
            )}
        </div>
    );
};

export default Orders;