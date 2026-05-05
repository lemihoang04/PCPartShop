import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../../context/UserProvider';
import { toast } from 'react-toastify';
import { GetOrdersData, CancelOrder, SubmitProductRating } from '../../services/apiService';
import OrderDetailModal from './OrderDetailModal';
import RatingModal from './RatingModal';
import './Orders.css';

const formatDate = (dateString) => {
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
};

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

    // Đưa fetchOrders ra ngoài để có thể gọi lại sau khi cancel
    const fetchOrders = async () => {
        try {
            setLoading(true);
            setOrders([]);
            const response = await GetOrdersData(user.account.id);
            if (response && response.errCode === 0) {
                const orders = (response.orders || []).map(item => ({
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
                    total: item.price * item.quantity
                }));
                setOrders(orders);
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            toast.error("Failed to load orders.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();

        // Cleanup function to clear orders when component unmounts or dependencies change
        return () => {
            setOrders([]);
        };
    }, [user, navigate]);

    const filteredOrders = orders.filter(order => {
        if (filter === 'all') return true;
        return order.status.toLowerCase() === filter.toLowerCase();
    });

    const sortedOrders = [...filteredOrders].sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'date') {
            comparison = new Date(a.date) - new Date(b.date);
        } else if (sortBy === 'total') {
            comparison = a.total - b.total;
        } else if (sortBy === 'status') {
            comparison = a.status.localeCompare(b.status);
        }
        return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Lấy tổng số lượng sản phẩm (giờ chỉ là quantity)
    const getTotalItems = (order) => order.quantity || 0;

    // Lấy ảnh sản phẩm an toàn
    const getProductImage = (order) => {
        if (!order.productImage) return "default-image.jpg";

        // Handle ";" separated image URLs
        try {
            return order.productImage.split("; ")[0];
        } catch (e) {
            return order.productImage;
        }
    };

    // Lấy tên sản phẩm
    const getProductName = (order) => order.title || 'Product';

    // Mở modal chi tiết đơn hàng
    const openOrderDetails = (order) => {
        setSelectedOrderId({ id: order.id, order_id: order.order_id }); // Nếu có order.order_id riêng, thay order.id bằng order.order_id
        setShowModal(true);
    };

    // Đóng modal
    const closeOrderDetails = () => {
        setShowModal(false);
        setSelectedOrderId(null);
    };

    // Xử lý hủy đơn hàng
    const handleCancel = async (order) => {
        if (window.confirm("Are you sure you want to cancel this order?")) {
            try {
                const response = await CancelOrder(order.id);
                if (response && response.errCode === 0) {
                    toast.success(`Order ${order.orderNumber} has been cancelled.`);
                    await fetchOrders(); // Fetch lại danh sách đơn hàng sau khi hủy thành công
                } else {
                    toast.error(`Failed to cancel order ${order.orderNumber}.`);
                }
            } catch (error) {
                toast.error(`Error cancelling order: ${error.message}`);
            }
        }
    };

    // Open rating modal
    const openRatingModal = (order) => {
        setSelectedOrderForRating(order);
        setShowRatingModal(true);
    };

    // Close rating modal
    const closeRatingModal = () => {
        setShowRatingModal(false);
        setSelectedOrderForRating(null);
    };

    // Handle rating submission
    const handleRatingSubmit = async (ratingData) => {
        try {
            const response = await SubmitProductRating(ratingData);
            return response;
        } catch (error) {
            console.error("Error submitting rating:", error);
            throw error;
        }
    };

    // Hiển thị trạng thái đang tải
    if (loading) {
        return (
            <div className="odrs__container">
                <div className="odrs__loading">
                    <div className="odrs__loading-spinner"></div>
                    <p>Loading your orders...</p>
                </div>
            </div>
        );
    }

    // Helper to determine if a button should be active
    const isFilterActive = (buttonFilter) => {
        return filter.toLowerCase() === buttonFilter.toLowerCase();
    };

    return (
        <div className="odrs__container">
            <div className="odrs__header">
                <h1 className="odrs__title">My Orders</h1>
                <div className="odrs__subheader">
                    <p className="odrs__count">
                        {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'} found
                    </p>
                </div>
            </div>

            <div className="odrs__controls">
                <div className="odrs__filters">
                    <button
                        className={`odrs__filter-btn ${isFilterActive('all') ? 'odrs__active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All Orders
                    </button>
                    <button
                        className={`odrs__filter-btn ${isFilterActive('pending') ? 'odrs__active' : ''}`}
                        onClick={() => setFilter('pending')}
                    >
                        Pending
                    </button>
                    <button
                        className={`odrs__filter-btn ${isFilterActive('processing') ? 'odrs__active' : ''}`}
                        onClick={() => setFilter('processing')}
                    >
                        Processing
                    </button>
                    <button
                        className={`odrs__filter-btn ${isFilterActive('shipped') ? 'odrs__active' : ''}`}
                        onClick={() => setFilter('shipped')}
                    >
                        Shipped
                    </button>

                    <button
                        className={`odrs__filter-btn ${isFilterActive('completed') ? 'odrs__active' : ''}`}
                        onClick={() => setFilter('completed')}
                    >
                        Completed
                    </button>
                    <button
                        className={`odrs__filter-btn ${isFilterActive('cancelled') ? 'odrs__active' : ''}`}
                        onClick={() => setFilter('cancelled')}
                    >
                        Cancelled
                    </button>
                </div>

                <div className="odrs__sort">
                    <label className="odrs__sort-label">Sort by:</label>
                    <select
                        className="odrs__sort-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        <option value="date">Date</option>
                        <option value="total">Total</option>
                        <option value="status">Status</option>
                    </select>
                    <button
                        className="odrs__sort-direction"
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    >
                        {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                </div>
            </div>

            {sortedOrders.length === 0 ? (
                <div className="odrs__empty">
                    <h3>No orders found</h3>
                    {filter !== 'all' ? (
                        <p>Try changing your filter or checking back later.</p>
                    ) : (
                        <>
                            <p>You haven't placed any orders yet. Start shopping to see your orders here!</p>
                            <button
                                className="odrs__button odrs__primary-button"
                                onClick={() => navigate('/laptops')}
                            >
                                Shop Now
                            </button>
                        </>
                    )}

                </div>
            ) : (
                // Add a unique key to the parent container of the orders list
                <div key={`${filter}-${sortBy}-${sortOrder}`} className="odrs__orders-list">
                    {sortedOrders.map((order) => (
                        <div key={order.id} className="odrs__order-card">
                            <div className="odrs__order-header">
                                <div className="odrs__order-info">
                                    <div className="odrs__order-number">
                                        <span className="odrs__label">Order #:</span>
                                        <span className="odrs__value">{order.orderNumber}</span>
                                    </div>
                                    <div className="odrs__order-date">
                                        <span className="odrs__label">Placed on:</span>
                                        <span className="odrs__value">{formatDate(order.date)}</span>
                                    </div>
                                </div>
                                <div className={`odrs__status odrs__status-${order.status}`}>
                                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                </div>
                            </div>

                            <div className="odrs__order-summary">
                                <div className="odrs__product-preview">
                                    <div className="odrs__product-image">
                                        <img src={getProductImage(order)} alt={getProductName(order)} />
                                    </div>
                                    <div className="odrs__product-info">
                                        <h4 className="odrs__product-name">{getProductName(order)}</h4>
                                        <div className="odrs__product-meta">
                                            <span className="odrs__quantity">x{getTotalItems(order)}</span>
                                            <span className="odrs__price">${(order.total || 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="odrs__order-actions">
                                <button
                                    className="odrs__button odrs__primary-button"
                                    onClick={() => openOrderDetails(order)}
                                >
                                    View Details
                                </button>
                                {/* <button className="odrs__button odrs__secondary-button">
                                    Track Order
                                </button> */}
                                {order.status === 'pending' && (
                                    <button
                                        className="odrs__button odrs__outline-button"
                                        onClick={() => handleCancel(order)}
                                    >
                                        Cancel Order
                                    </button>
                                )}
                                {order.status === 'completed' && (
                                    <button
                                        className="odrs__button odrs__rating-button"
                                        onClick={() => openRatingModal(order)}
                                    >
                                        Rate Product
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Order Detail Modal */}
            {showModal && selectedOrderId && (
                <OrderDetailModal
                    order={orders.find(order => order.id === selectedOrderId.id)}
                    onClose={closeOrderDetails}
                />
            )}

            {/* Rating Modal */}
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