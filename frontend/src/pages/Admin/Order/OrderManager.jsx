import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { GetOrdersData, CancelOrder, UpdateOrderStatus } from "../../../services/orderService";
import { FaEye, FaTimes, FaCheck, FaTruck, FaCheckCircle } from "react-icons/fa";
import "./OrderManager.css";

const OrderManager = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [activeTab, setActiveTab] = useState("all");
    const [filteredOrders, setFilteredOrders] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, action: null, message: '', orderId: null, newStatus: null });

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const response = await GetOrdersData("all");
            if (response && response.errCode === 0) {
                // Chuẩn hóa dữ liệu trước khi lưu vào state
                const normalizedOrders = (response.orders || []).map(order => ({
                    ...order,
                    // Đảm bảo status luôn có giá trị và được chuẩn hóa
                    status: order.status ? order.status.toLowerCase().trim() : 'unknown'
                }));

                setOrders(normalizedOrders);
                // Áp dụng bộ lọc hiện tại cho dữ liệu mới nhận
                filterOrdersByStatus(normalizedOrders, activeTab);
            } else {
                toast.error("Failed to fetch orders.");
            }
        } catch (error) {
            toast.error("Error fetching orders: " + (error.message || "Unknown error"));
            console.error("Order fetch error:", error);
        } finally {
            setLoading(false);
        }
    };

    const filterOrdersByStatus = (ordersData, status, term = "") => {
        if (!ordersData || ordersData.length === 0) {
            setFilteredOrders([]);
            return;
        }

            // Chuẩn hóa dữ liệu đầu vào
            const normalizedOrders = ordersData.map(order => ({
                ...order,
                status: order.status ? order.status.toLowerCase().trim() : 'unknown'
            }));

            let filtered = normalizedOrders;

            if (status !== "all") {
                const normalizedStatus = status.toLowerCase().trim();
                filtered = filtered.filter(order => order.status === normalizedStatus);
            }

            if (term) {
                const lowerTerm = term.toLowerCase();
                filtered = filtered.filter(order =>
                    (order.order_id && order.order_id.toString().toLowerCase().includes(lowerTerm)) ||
                    (order.id && order.id.toString().toLowerCase().includes(lowerTerm)) ||
                    (order.user_name && order.user_name.toLowerCase().includes(lowerTerm)) ||
                    (order.userId && order.userId.toString().toLowerCase().includes(lowerTerm))
                );
            }

            // Sắp xếp đơn hàng với đơn hàng được tạo gần đây nhất lên đầu
            const sortedFiltered = [...filtered].sort((a, b) => {
                return new Date(b.created_at) - new Date(a.created_at);
            });

            setFilteredOrders(sortedFiltered);
            setCurrentPage(1); // Reset to page 1 on filter
        };    // Gọi fetchOrders khi component được mount
        useEffect(() => {
            fetchOrders();
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);// eslint-disable-next-line react-hooks/exhaustive-deps
        useEffect(() => {
            if (orders && orders.length > 0) {
                filterOrdersByStatus(orders, activeTab, searchTerm);
            }
        }, [activeTab, searchTerm, orders]);

        const handleTabChange = (status) => {
            setActiveTab(status);
            if (orders && orders.length > 0) {
                filterOrdersByStatus(orders, status, searchTerm);
            }
        };
        const openCancelConfirm = (orderId) => {
            setConfirmDialog({
                isOpen: true,
                action: 'cancel',
                message: 'Are you sure you want to cancel this order?',
                orderId: orderId,
                newStatus: null
            });
        };

        const openUpdateConfirm = (orderId, newStatus) => {
            const actionName = newStatus === 'processing' ? 'approve' : newStatus === 'shipped' ? 'ship' : 'complete';
            setConfirmDialog({
                isOpen: true,
                action: 'update',
                message: `Are you sure you want to ${actionName} this order?`,
                orderId: orderId,
                newStatus: newStatus
            });
        };

        const executeConfirmAction = async () => {
            const { action, orderId, newStatus } = confirmDialog;
            setConfirmDialog({ isOpen: false, action: null, message: '', orderId: null, newStatus: null });

            if (action === 'cancel') {
                await executeCancelOrder(orderId);
            } else if (action === 'update') {
                await executeUpdateStatus(orderId, newStatus);
            }
        };

        const closeConfirmDialog = () => {
            setConfirmDialog({ isOpen: false, action: null, message: '', orderId: null, newStatus: null });
        };

        const executeCancelOrder = async (orderId) => {
            try {
                const response = await CancelOrder(orderId);
                if (response && response.errCode === 0) {
                    toast.success("Order cancelled successfully.");

                    const updatedOrders = orders.map(order =>
                        (order.order_id === orderId || order.id === orderId)
                            ? { ...order, status: "cancelled".toLowerCase().trim() }
                            : order
                    );

                    setOrders(updatedOrders);
                    filterOrdersByStatus(updatedOrders, activeTab, searchTerm);
                } else {
                    toast.error("Failed to cancel order.");
                }
            } catch (error) {
                toast.error("Error cancelling order: " + (error.message || "Unknown error"));
                console.error("Cancel order error:", error);
            }
        };

        const executeUpdateStatus = async (orderId, newStatus) => {
            const actionName = newStatus === 'processing' ? 'approve' : newStatus === 'shipped' ? 'ship' : 'complete';
            try {
                const response = await UpdateOrderStatus(orderId, newStatus);
                if (response && response.errCode === 0) {
                    toast.success(`Order ${actionName}d successfully.`);

                    const updatedOrders = orders.map(order =>
                        (order.order_id === orderId || order.id === orderId)
                            ? { ...order, status: newStatus.toLowerCase().trim() }
                            : order
                    );

                    setOrders(updatedOrders);
                    filterOrdersByStatus(updatedOrders, activeTab, searchTerm);
                } else {
                    toast.error(`Failed to ${actionName} order.`);
                }
            } catch (error) {
                toast.error(`Error updating order: ` + (error.message || "Unknown error"));
                console.error(`Update order error:`, error);
            }
        };

        const handleViewDetails = (order) => {
            setSelectedOrder(order);
        };

        const closeModal = () => setSelectedOrder(null);

        const formatMoney = (amount) =>
            amount ? amount.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "N/A"; const getStatusClass = (status) => {
                if (!status) return "status-unknown";

                // Chuyển đổi status thành chữ thường để đảm bảo so sánh chính xác
                const normalizedStatus = status.toLowerCase().trim();

                if (normalizedStatus === "cancelled") return "status-cancelled";
                if (normalizedStatus === "completed") return "status-completed";
                if (normalizedStatus === "pending") return "status-pending";
                return "status-other";
            };

        // Hàm giúp hiển thị trạng thái đơn hàng một cách nhất quán
        const formatStatus = (status) => {
            if (!status) return "Unknown";

            const normalizedStatus = status.toLowerCase().trim();
            // Chuẩn hóa cách viết hoa chữ cái đầu tiên
            return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
        };

        // Phân trang
        const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
        const indexOfLastItem = currentPage * itemsPerPage;
        const indexOfFirstItem = indexOfLastItem - itemsPerPage;
        const currentOrders = filteredOrders.slice(indexOfFirstItem, indexOfLastItem);

        return (
            <div className="om-container">
                {/* Header */}
                <div className="om-header">
                    <div className="om-header-left">
                        <h2 className="om-title">
                            <i className="bi bi-box-seam-fill me-2" />
                            Order Management
                        </h2>
                        <span className="om-count">{filteredOrders.length} orders</span>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="om-toolbar">
                    <div className="om-search-wrap">
                        <i className="bi bi-search om-search-icon" />
                        <input
                            className="om-search"
                            placeholder="Search by Order ID or Customer..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select className="om-filter-select" value={activeTab} onChange={(e) => handleTabChange(e.target.value)}>
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                {/* Table */}
                <div className="om-card">
                    {loading ? (
                        <div className="om-loading">
                            <div className="om-spinner" />
                            <span>Loading orders...</span>
                        </div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="om-empty">
                            <i className="bi bi-box-seam" />
                            <p>No {activeTab !== "all" ? activeTab : ""} orders found</p>
                        </div>
                    ) : (
                        <>
                            <div className="om-table-wrap">
                                <table className="om-table">
                                <thead>
                                    <tr>
                                        <th>Order ID</th>
                                        <th>Customer</th>
                                        <th>Created Date</th>
                                        <th>Payment Method</th>
                                        <th>Status</th>
                                        <th>Total</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentOrders.map((order) => (
                                        <tr key={order.order_id || order.id}>
                                            <td>
                                                <span className="om-code-badge">{order.order_id || order.id}</span>
                                            </td>
                                            <td className="om-value-cell">{order.user_name || order.userId || "N/A"}</td>
                                            <td className="om-date-cell">{order.created_at ? new Date(order.created_at).toLocaleString() : "N/A"}</td>
                                            <td>
                                                {order.payment_method ?
                                                    <span className="om-type-badge om-type-fixed">
                                                        {order.payment_method === 'pay_later' ? 'Pay Later' :
                                                            order.payment_method === 'online_payment' ? 'Online' :
                                                                order.payment_method}
                                                    </span>
                                                    : "N/A"}
                                            </td>
                                            <td>
                                                <span className={`om-status-badge ${getStatusClass(order.status)}`}>
                                                    <span className="om-status-dot" />
                                                    {formatStatus(order.status)}
                                                </span>
                                            </td>
                                            <td className="om-value-cell">{formatMoney(order.total || order.price * order.quantity)}</td>
                                            <td className="om-actions-cell">
                                                <button className="om-btn-action om-btn-view" onClick={() => handleViewDetails(order)} title="View Details">
                                                    <FaEye />
                                                </button>
                                                {order.status && order.status.toLowerCase() === "pending" && (
                                                    <>
                                                        <button
                                                            className="om-btn-action om-btn-approve"
                                                            onClick={() => openUpdateConfirm(order.order_id || order.id, "processing")}
                                                            title="Approve"
                                                        >
                                                            <FaCheck />
                                                        </button>
                                                        <button
                                                            className="om-btn-action om-btn-cancel"
                                                            onClick={() => openCancelConfirm(order.order_id || order.id)}
                                                            title="Cancel"
                                                        >
                                                            <FaTimes />
                                                        </button>
                                                    </>
                                                )}
                                                {order.status && order.status.toLowerCase() === "processing" && (
                                                    <button
                                                        className="om-btn-action om-btn-ship"
                                                        onClick={() => openUpdateConfirm(order.order_id || order.id, "shipped")}
                                                        title="Ship"
                                                    >
                                                        <FaTruck />
                                                    </button>
                                                )}
                                                {order.status && order.status.toLowerCase() === "shipped" && (
                                                    <button
                                                        className="om-btn-action om-btn-complete"
                                                        onClick={() => openUpdateConfirm(order.order_id || order.id, "completed")}
                                                        title="Complete"
                                                    >
                                                        <FaCheckCircle />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="om-pagination">
                                <span className="om-page-info">
                                    Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredOrders.length)} of {filteredOrders.length} entries
                                </span>
                                <div className="om-page-controls">
                                    <button 
                                        className="om-page-btn" 
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    >
                                        Prev
                                    </button>
                                    {[...Array(totalPages)].map((_, i) => (
                                        <button 
                                            key={i + 1}
                                            className={`om-page-btn ${currentPage === i + 1 ? 'active' : ''}`}
                                            onClick={() => setCurrentPage(i + 1)}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                    <button 
                                        className="om-page-btn" 
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

                {selectedOrder && (
                    <div className="order-modal">
                        <div className="order-modal-content">
                            <h3>Order Details</h3>
                            <p><b>Order ID:</b> {selectedOrder.order_id || selectedOrder.id}</p>
                            <p><b>Customer:</b> {selectedOrder.user_name || selectedOrder.userId}</p>
                            <p><b>Created Date:</b> {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : "N/A"}</p>
                            <p><b>Payment Method:</b> {selectedOrder.payment_method ? 
                                (selectedOrder.payment_method === 'pay_later' ? 'Pay Later' : 
                                 selectedOrder.payment_method === 'online_payment' ? 'Online' : 
                                 selectedOrder.payment_method) : "N/A"}
                            </p>
                            <p><b>Payment Status:</b> <span style={{
                                color: selectedOrder.payment_status === 'paid' || selectedOrder.payment_status === 'completed' ? '#16a34a' : 
                                       selectedOrder.payment_status === 'pending' ? '#d97706' : '#64748b',
                                fontWeight: 600,
                                textTransform: 'capitalize'
                            }}>
                                {selectedOrder.payment_status || "N/A"}
                            </span></p>
                            <p><b>Status:</b> <span className={`order-status ${getStatusClass(selectedOrder.status)}`}>{formatStatus(selectedOrder.status)}</span></p>
                            <p><b>Total:</b> {formatMoney(selectedOrder.total || selectedOrder.price * selectedOrder.quantity)}</p>
                            <button className="close-modal-btn" onClick={closeModal}>Close</button>
                        </div>
                    </div>
                )}

                {/* Confirm Dialog */}
                {confirmDialog.isOpen && (
                    <div className="order-modal">
                        <div className="order-modal-content" style={{ minWidth: '300px', textAlign: 'center' }}>
                            <h3 style={{ color: '#1e293b', marginBottom: '16px' }}>Confirm Action</h3>
                            <p style={{ marginBottom: '24px', fontSize: '1rem' }}>{confirmDialog.message}</p>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                <button 
                                    className="close-modal-btn" 
                                    style={{ margin: 0, background: '#f1f5f9', color: '#475569', flex: 1 }} 
                                    onClick={closeConfirmDialog}
                                >
                                    Cancel
                                </button>
                                <button 
                                    className="close-modal-btn" 
                                    style={{ margin: 0, background: confirmDialog.action === 'cancel' ? '#ef4444' : '#4f46e5', color: '#fff', flex: 1 }} 
                                    onClick={executeConfirmAction}
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

export default OrderManager;