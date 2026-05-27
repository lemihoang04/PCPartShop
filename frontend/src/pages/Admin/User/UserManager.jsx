import React, { useEffect, useState } from "react";
import { GetAllUser, DeleteUser } from "../../../services/userService";
import { toast } from "react-toastify";
import "./UserManager.css";

const UserManager = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await GetAllUser();
            if (Array.isArray(response)) {
                setUsers(response);
            } else if (response && Array.isArray(response.data)) {
                setUsers(response.data);
            } else {
                toast.error("Unable to load user list.");
            }
        } catch (error) {
            toast.error("Error loading user list.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleDelete = async (userId, userName) => {
        if (window.confirm(`Are you sure you want to delete user "${userName}"?`)) {
            try {
                await DeleteUser(userId);
                toast.success("User deleted successfully.");
                fetchUsers();
            } catch (error) {
                toast.error("Error deleting user.");
            }
        }
    };

    /* ── Filter ── */
    const filtered = users.filter((u) =>
        (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.phone || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="usr-container">
            {/* Header */}
            <div className="usr-header">
                <div className="usr-header-left">
                    <h2 className="usr-title">
                        <i className="bi bi-people-fill me-2" />
                        User Management
                    </h2>
                    <span className="usr-count">{filtered.length} users</span>
                </div>
            </div>

            {/* Toolbar */}
            <div className="usr-toolbar">
                <div className="usr-search-wrap">
                    <i className="bi bi-search usr-search-icon" />
                    <input
                        className="usr-search"
                        placeholder="Search by name, email or phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="usr-card">
                {loading ? (
                    <div className="usr-loading">
                        <div className="usr-spinner" />
                        <span>Loading...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="usr-empty">
                        <i className="bi bi-people" />
                        <p>No users found.</p>
                    </div>
                ) : (
                    <div className="usr-table-wrap">
                        <table className="usr-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Address</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((user) => (
                                    <tr key={user.id}>
                                        <td>
                                            <span className="usr-id-badge">#{user.id}</span>
                                        </td>
                                        <td className="usr-name-cell">{user.name}</td>
                                        <td className="usr-email-cell">{user.email}</td>
                                        <td className="usr-phone-cell">{user.phone || "—"}</td>
                                        <td className="usr-address-cell" title={user.address}>
                                            {user.address || "—"}
                                        </td>
                                        <td className="usr-actions-cell">
                                            <button
                                                className="usr-btn-delete"
                                                onClick={() => handleDelete(user.id, user.name)}
                                                title="Delete"
                                            >
                                                <i className="bi bi-trash" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserManager;