import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import "./CategoryManager.css";
import axios from "../../../setup/axios";

/* ─── Helpers ─────────────────────────────────────────────── */
const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
    });
};

/* ─── Component ───────────────────────────────────────────── */
const CategoryManager = () => {
    const [categories, setCategories] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState("");
    const [editingDescription, setEditingDescription] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    /* ── Fetch ── */
    const fetchCategories = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get("/categories");
            const data = Array.isArray(res) ? res : res.data;
            setCategories(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Error fetching categories:", error);
            toast.error("Error loading categories");
            setCategories([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchCategories(); }, []);

    /* ── Delete ── */
    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete category "${name}"?`)) return;
        try {
            await axios.delete(`/categories/${id}`);
            toast.success("Category deleted successfully");
            fetchCategories();
        } catch (error) {
            toast.error("Error deleting category");
            console.error(error);
        }
    };

    /* ── Edit ── */
    const handleEdit = (id, name, description = "") => {
        setEditingId(id);
        setEditingName(name);
        setEditingDescription(description || "");
    };

    const handleSaveEdit = async (id) => {
        if (!editingName.trim()) {
            toast.warning("Category name cannot be empty");
            return;
        }
        try {
            await axios.put(`/categories/${id}`, {
                name: editingName,
                description: editingDescription,
            });
            toast.success("Category updated successfully");
            setEditingId(null);
            setEditingName("");
            setEditingDescription("");
            fetchCategories();
        } catch (error) {
            toast.error("Error updating category");
            console.error(error);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditingName("");
        setEditingDescription("");
    };

    /* ── Filter ── */
    const filtered = categories.filter((cat) =>
        cat.category_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cat.description && cat.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    /* ─── Render ─────────────────────────────────────────── */
    return (
        <div className="cat-container">
            {/* Header */}
            <div className="cat-header">
                <div className="cat-header-left">
                    <h2 className="cat-title">
                        <i className="bi bi-grid-fill me-2" />
                        Category Management
                    </h2>
                    <span className="cat-count">{filtered.length} categories</span>
                </div>
            </div>

            {/* Toolbar */}
            <div className="cat-toolbar">
                <div className="cat-search-wrap">
                    <i className="bi bi-search cat-search-icon" />
                    <input
                        className="cat-search"
                        placeholder="Search by name or description..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="cat-card">
                {isLoading ? (
                    <div className="cat-loading">
                        <div className="cat-spinner" />
                        <span>Loading...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="cat-empty">
                        <i className="bi bi-grid" />
                        <p>{searchTerm ? "No categories match your search" : "No categories available"}</p>
                    </div>
                ) : (
                    <div className="cat-table-wrap">
                        <table className="cat-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Created</th>
                                    <th>Updated</th>
                                    {/* <th>Actions</th> */}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((cat) => (
                                    <tr key={cat.category_id}>
                                        <td>
                                            <span className="cat-id-badge">#{cat.category_id}</span>
                                        </td>
                                        <td>
                                            {editingId === cat.category_id ? (
                                                <input
                                                    type="text"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    className="cat-edit-input"
                                                />
                                            ) : (
                                                <span className="cat-name-cell">{cat.category_name}</span>
                                            )}
                                        </td>
                                        <td>
                                            {editingId === cat.category_id ? (
                                                <textarea
                                                    value={editingDescription}
                                                    onChange={(e) => setEditingDescription(e.target.value)}
                                                    className="cat-edit-textarea"
                                                />
                                            ) : (
                                                <span className="cat-desc-cell" title={cat.description}>
                                                    {cat.description || "—"}
                                                </span>
                                            )}
                                        </td>
                                        <td className="cat-date-cell">{formatDate(cat.created_at)}</td>
                                        <td className="cat-date-cell">{formatDate(cat.updated_at)}</td>
                                        {/* <td className="cat-actions-cell">
                                            {editingId === cat.category_id ? (
                                                <>
                                                    <button
                                                        className="cat-btn-save"
                                                        onClick={() => handleSaveEdit(cat.category_id)}
                                                        title="Save"
                                                    >
                                                        <i className="bi bi-check-lg" />
                                                    </button>
                                                    <button
                                                        className="cat-btn-cancel"
                                                        onClick={handleCancelEdit}
                                                        title="Cancel"
                                                    >
                                                        <i className="bi bi-x-lg" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        className="cat-btn-edit"
                                                        onClick={() => handleEdit(cat.category_id, cat.category_name, cat.description)}
                                                        title="Edit"
                                                    >
                                                        <i className="bi bi-pencil" />
                                                    </button>
                                                    <button
                                                        className="cat-btn-delete"
                                                        onClick={() => handleDelete(cat.category_id, cat.category_name)}
                                                        title="Delete"
                                                    >
                                                        <i className="bi bi-trash" />
                                                    </button>
                                                </>
                                            )}
                                        </td> */}
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

export default CategoryManager;