import React, { useState, useContext } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./Admin.css";
import Sidebar from "./Sidebar/Sidebar.jsx";
import Dashboard from "./Dashboard/Dashboard.jsx";
import UserManager from "./User/UserManager.jsx";
import OrderManager from "./Order/OrderManager.jsx";
import CategoryManager from "./Category/CategoryManager.jsx";
import ProductManager from "./Product/ProductManager.jsx";
import CouponManager from "./Coupon/CouponManager.jsx";
import adminAvatar from "./assets/images/admin-icon.svg"; // Make sure this path is correct
// import Settings from "./Settings/Settings.jsx";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../../context/UserProvider";
import { toast } from "react-toastify";
import { LogoutAdmin } from "../../services/adminService.js";

const Admin = () => {
    const [activeTab, setActiveTab] = useState("Dashboard");
    const [collapsed, setCollapsed] = useState(false);
    const [notifications, setNotifications] = useState(3); // Example notification count
    const { logoutAdmin } = useContext(UserContext);
    const toggleSidebar = () => {
        setCollapsed(!collapsed);
    };
    const navigate = useNavigate();
    const renderContent = () => {
        switch (activeTab) {
            case "Dashboard":
                return <Dashboard />;
            case "Category":
                return <CategoryManager />;
            case "Order":
                return <OrderManager />;
            case "Customers":
                return <UserManager />;
            case "Product":
                return <ProductManager />;
            case "Coupon":
                return <CouponManager />;
            // case "Settings":
            //     return <Settings />;
            default:
                return <Dashboard />;
        }
    };
    const handleLogout = async () => {
        try {
            let data = await LogoutAdmin();

            if (data && data.errCode === 0) {
                logoutAdmin();
                navigate("/admin/login");
                toast.success("Log out success");
            } else {
                toast.error("Log out failed");
            }
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };
    return (
        <div className="admin-panel-container">
            {/* Sidebar Component with updated props */}
            <div className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`}>
                <div className="admin-sidebar-header d-flex justify-content-between align-items-center">
                    {!collapsed && <h4 className="mb-0 fw-bold text-primary">TechAdmin</h4>}
                    <button className="btn btn-sm p-1 rounded-circle" onClick={toggleSidebar}>
                        <i className={`bi ${collapsed ? 'bi-chevron-right' : 'bi-chevron-left'}`}></i>
                    </button>
                </div>

                {/* Admin Profile Section */}
                <div className="px-3 py-4 text-center">
                    {!collapsed ? (
                        <>
                            <img
                                src={adminAvatar || "https://via.placeholder.com/50"}
                                alt="Admin"
                                className="admin-profile-img mb-2"
                            />
                            <h6 className="mb-1 fw-bold">Admin User</h6>
                            <p className="small text-muted mb-3">Administrator</p>
                            <div className="bg-light rounded-pill py-1 px-2 small mb-3">
                                <i className="bi bi-circle-fill text-success me-1" style={{ fontSize: '8px' }}></i>
                                <span>Online</span>
                            </div>
                        </>
                    ) : (
                        <img
                            src={adminAvatar || "https://via.placeholder.com/35"}
                            alt="Admin"
                            className="admin-logo mx-auto d-block mb-2"
                        />
                    )}
                </div>

                {/* Navigation Items */}
                <div className="admin-sidebar-menu">
                    {[
                        { name: "Dashboard", icon: "bi-speedometer2" },
                        { name: "Category", icon: "bi-tag" },
                        { name: "Product", icon: "bi-box" },
                        { name: "Order", icon: "bi-cart" },
                        { name: "Customers", icon: "bi-people" },
                        { name: "Coupon", icon: "bi-ticket-perforated" },
                        // { name: "Reports", icon: "bi-bar-chart" },
                        // { name: "Settings", icon: "bi-gear" },
                    ].map((item) => (
                        <button
                            key={item.name}
                            className={`admin-sidebar-item btn border-0 w-100 ${activeTab === item.name ? "active" : ""}`}
                            onClick={() => setActiveTab(item.name)}
                        >
                            <i className={`${item.icon} ${collapsed ? 'mx-auto' : 'me-3'}`}></i>
                            {!collapsed && <span>{item.name}</span>}
                        </button>
                    ))}
                </div>

                {/* Logout Section */}
                <div className="admin-sidebar-footer mt-auto">
                    <button className="admin-logout-btn" onClick={handleLogout}>
                        <i className="bi bi-box-arrow-left me-3"></i>
                        {!collapsed && <span>Logout</span>}
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className={`admin-content-area ${collapsed ? "expanded" : ""}`}>
                {/* Top Navbar */}
                {/* <div className="admin-top-navbar d-flex justify-content-between align-items-center">
                    <div>
                        <h5 className="mb-0 fw-bold">{activeTab}</h5>
                        <nav aria-label="breadcrumb">
                            <ol className="breadcrumb mb-0 small">
                                <li className="breadcrumb-item"><a href="#" className="text-decoration-none">Home</a></li>
                                <li className="breadcrumb-item active" aria-current="page">{activeTab}</li>
                            </ol>
                        </nav>
                    </div>
                    <div className="d-flex align-items-center">
                        <div className="admin-notification-bell me-4">
                            <i className="bi bi-bell fs-4"></i>
                            {notifications > 0 && (
                                <span className="admin-notification-badge">{notifications}</span>
                            )}
                        </div>
                        <div className="admin-user-profile">
                            <img
                                src={adminAvatar || "https://via.placeholder.com/40"}
                                alt="Admin"
                                className="admin-logo me-2"
                            />
                            <div className="d-none d-md-block">
                                <h6 className="mb-0 fw-bold">Admin User</h6>
                                <small className="text-muted">Administrator</small>
                            </div>
                        </div>
                    </div>
                </div> */}

                {/* Main Content */}
                <div className="admin-main-content">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default Admin;