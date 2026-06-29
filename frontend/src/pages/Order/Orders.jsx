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
import { GetReturnRequestsByUser } from '../../services/returnReqService';
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
    FaChevronDown,
    FaChevronUp,
    FaUndo,
    FaClipboardList,
} from 'react-icons/fa';
import OrderDetailModal from './OrderDetailModal';
import RatingModal from './RatingModal';
import ReturnReqModal from './ReturnReqModal';
import ReturnStatusModal from './ReturnStatusModal';
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
    const [selectedGroupedOrder, setSelectedGroupedOrder] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [showRatingModal, setShowRatingModal] = useState(false);
    const [selectedOrderForRating, setSelectedOrderForRating] = useState(null);
    const [expandedOrders, setExpandedOrders] = useState({});
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [selectedItemForReturn, setSelectedItemForReturn] = useState(null);
    // returnRequests: { [order_item_id]: returnRequestObject }
    const [returnRequests, setReturnRequests] = useState({});
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [selectedReturnReq, setSelectedReturnReq] = useState(null);

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
                    payment_method: item.payment_method,
                    productId: item.product_id,
                    title: item.title,
                    productImage: item.image,
                    price: item.price,
                    quantity: item.quantity,
                    total: item.price * item.quantity,
                    is_reviewed: !!item.is_reviewed,
                }));
                setOrders(mapped);

                // Fetch return requests and build a map keyed by order_item_id
                try {
                    const rrRes = await GetReturnRequestsByUser(user.account.id);
                    if (rrRes && rrRes.errCode === 0) {
                        const map = {};
                        (rrRes.data || []).forEach(rr => {
                            map[rr.order_item_id] = rr;
                        });
                        setReturnRequests(map);
                    }
                } catch { /* non-fatal */ }
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

    // Group orders by orderNumber (order_id)
    const groupedOrdersMap = orders.reduce((acc, order) => {
        const key = order.order_id;
        if (!acc[key]) {
            acc[key] = {
                order_id: order.order_id,
                orderNumber: order.orderNumber,
                date: order.date,
                updated_at: order.updated_at,
                status: order.status,
                payment_method: order.payment_method,
                userId: order.userId,
                items: [],
            };
        }
        acc[key].items.push(order);
        return acc;
    }, {});

    const groupedOrders = Object.values(groupedOrdersMap);

    const filteredOrders = groupedOrders.filter(group =>
        filter === 'all' || group.status === filter
    );

    const sortedOrders = [...filteredOrders].sort((a, b) => {
        let cmp = 0;
        const totalA = a.items.reduce((s, i) => s + i.total, 0);
        const totalB = b.items.reduce((s, i) => s + i.total, 0);
        if (sortBy === 'date')   cmp = new Date(a.date) - new Date(b.date);
        if (sortBy === 'total')  cmp = totalA - totalB;
        if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
        return sortOrder === 'desc' ? -cmp : cmp;
    });

    const getProductImage = (item) => {
        if (!item.productImage) return '/default-image.jpg';
        return item.productImage.split('; ')[0];
    };

    const toggleExpand = (orderId) => {
        setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
    };

    const openOrderDetails = (group) => {
        setSelectedGroupedOrder(group);
        setShowModal(true);
    };
    const closeOrderDetails = () => { setShowModal(false); setSelectedGroupedOrder(null); };

    const handleCancel = async (group) => {
        if (!window.confirm('Are you sure you want to cancel this order?')) return;
        try {
            // Cancel first item's id (the order_id is shared)
            const response = await CancelOrder(group.items[0].id);
            if (response && response.errCode === 0) {
                toast.success(`Order ${group.orderNumber} cancelled.`);
                await fetchOrders();
            } else {
                toast.error(`Failed to cancel order ${group.orderNumber}.`);
            }
        } catch (error) {
            toast.error(`Error: ${error.message}`);
        }
    };

    const openRatingModal = (item) => {
        setSelectedOrderForRating(item);
        setShowRatingModal(true);
    };
    const closeRatingModal = () => { setShowRatingModal(false); setSelectedOrderForRating(null); };

    const openReturnModal = (item) => {
        setSelectedItemForReturn(item);
        setShowReturnModal(true);
    };
    const closeReturnModal = () => { setShowReturnModal(false); setSelectedItemForReturn(null); };

    const openStatusModal = (rr) => {
        setSelectedReturnReq(rr);
        setShowStatusModal(true);
    };
    const closeStatusModal = () => { setShowStatusModal(false); setSelectedReturnReq(null); };

    const handleReturnCancelled = (requestId) => {
        // Mark as REJECTED locally so button updates without a full refetch
        setReturnRequests(prev => {
            const updated = { ...prev };
            for (const key in updated) {
                if (updated[key].request_id === requestId) {
                    updated[key] = { ...updated[key], status: 'REJECTED' };
                }
            }
            return updated;
        });
    };

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
                    {sortedOrders.map(group => {
                        const sc = STATUS_CONFIG[group.status] || { icon: null, label: group.status, cls: '' };
                        const isExpanded = expandedOrders[group.order_id];
                        const visibleItems = isExpanded ? group.items : group.items.slice(0, 2);
                        const hasMore = group.items.length > 2;
                        const groupTotal = group.items.reduce((s, i) => s + i.total, 0);

                        return (
                            <div key={group.order_id} className="odrs__card">
                                {/* Card header */}
                                <div className="odrs__card-head">
                                    <div className="odrs__card-meta">
                                        <span className="odrs__meta-item">
                                            <FaHashtag className="odrs__meta-icon" />
                                            <strong>{group.orderNumber}</strong>
                                        </span>
                                        <span className="odrs__divider" />
                                        <span className="odrs__meta-item">
                                            <FaCalendarAlt className="odrs__meta-icon" />
                                            {formatDate(group.date)}
                                        </span>
                                        <span className="odrs__divider" />
                                        <span className="odrs__meta-item">
                                            <strong>{group.items.length}</strong>&nbsp;{group.items.length === 1 ? 'item' : 'items'}
                                        </span>
                                    </div>
                                    <div className="odrs__card-head-right">
                                        <span className="odrs__group-total">${groupTotal.toFixed(2)}</span>
                                        <span className={`odrs__status odrs__status-${sc.cls}`}>
                                            {sc.icon}
                                            {sc.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Product rows */}
                                <div className="odrs__products-list">
                                    {visibleItems.map(item => (
                                        <div key={item.id} className="odrs__product-row">
                                            <div className="odrs__thumb">
                                                <img
                                                    src={getProductImage(item)}
                                                    alt={item.title || 'Product'}
                                                    onError={e => { e.target.src = '/default-image.jpg'; }}
                                                />
                                            </div>
                                            <div className="odrs__product-body">
                                                <div className="odrs__name-row">
                                                    <p
                                                        className="odrs__product-name"
                                                        onClick={() => navigate(`/product-info/${item.productId}`)}
                                                    >
                                                        {item.title || 'Product'}
                                                    </p>
                                                    {/* Per-product rate button for completed orders */}
                                                    {group.status === 'completed' && !item.is_reviewed && (
                                                        <button
                                                            className="odrs__btn odrs__btn-rate odrs__btn-rate-inline"
                                                            onClick={() => openRatingModal(item)}
                                                        >
                                                            <FaStar /> Rate
                                                        </button>
                                                    )}
                                                    {group.status === 'completed' && item.is_reviewed && (
                                                        <span className="odrs__reviewed-badge odrs__reviewed-inline">
                                                            <FaCheckCircle /> Reviewed
                                                        </span>
                                                    )}
                                                    {group.status === 'completed' && (() => {
                                                        const rr = returnRequests[item.id];
                                                        // Active request exists (not REJECTED/FAILED)
                                                        const activeRR = rr && !['REJECTED','FAILED'].includes(rr.status) ? rr : null;
                                                        if (activeRR) {
                                                            return (
                                                                <button
                                                                    className="odrs__btn odrs__btn-return odrs__btn-return-inline"
                                                                    onClick={() => openStatusModal(activeRR)}
                                                                    title="View return request status"
                                                                >
                                                                    <FaClipboardList /> View Request
                                                                </button>
                                                            );
                                                        }
                                                        return (
                                                            <button
                                                                className="odrs__btn odrs__btn-return odrs__btn-return-inline"
                                                                onClick={() => openReturnModal(item)}
                                                                title="Request refund or exchange"
                                                            >
                                                                <FaUndo /> Return Request
                                                            </button>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="odrs__product-foot">
                                                    <span className="odrs__qty">Qty: {item.quantity}</span>
                                                    <span className="odrs__price">${(item.total || 0).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* See More / See Less */}
                                {hasMore && (
                                    <button
                                        className="odrs__see-more-btn"
                                        onClick={() => toggleExpand(group.order_id)}
                                    >
                                        {isExpanded ? (
                                            <><FaChevronUp /> See Less</>
                                        ) : (
                                            <><FaChevronDown /> See More ({group.items.length - 2} more items)</>
                                        )}
                                    </button>
                                )}

                                {/* Actions */}
                                <div className="odrs__actions">
                                    <button
                                        className="odrs__btn odrs__btn-primary"
                                        onClick={() => openOrderDetails(group)}
                                    >
                                        <FaEye /> View Details
                                    </button>

                                    {group.status === 'pending' && group.payment_method === 'pay_later' && (
                                        <button
                                            className="odrs__btn odrs__btn-danger"
                                            onClick={() => handleCancel(group)}
                                        >
                                            <FaTimesCircle /> Cancel
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && selectedGroupedOrder && (
                <OrderDetailModal
                    groupedOrder={selectedGroupedOrder}
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

            {showReturnModal && selectedItemForReturn && (
                <ReturnReqModal
                    item={selectedItemForReturn}
                    onClose={closeReturnModal}
                    onSuccess={(newReq) => {
                        // Add to local map immediately so button switches to "View Request"
                        setReturnRequests(prev => ({
                            ...prev,
                            [selectedItemForReturn.id]: {
                                ...newReq,
                                product_name: selectedItemForReturn.title,
                                quantity: selectedItemForReturn.quantity,
                            },
                        }));
                    }}
                />
            )}

            {showStatusModal && selectedReturnReq && (
                <ReturnStatusModal
                    returnRequest={selectedReturnReq}
                    onClose={closeStatusModal}
                    onCancelled={handleReturnCancelled}
                />
            )}
        </div>
    );
};

export default Orders;