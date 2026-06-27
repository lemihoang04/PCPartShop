import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
    getAllFAQs,
    createFAQ,
    updateFAQ,
    deleteFAQ,
} from "../../../services/chatbotService.js";
import "./ChatbotFAQ.css";

/* ─── Helpers ─────────────────────────────────────────────── */
const EMPTY_FORM = {
    question: "",
    answer: "",
    category: "",
};

const CATEGORY_OPTIONS = [
    "General",
    "Shipping",
    "Payment",
    "Warranty",
    "Returns",
    "Account",
    "Orders",
    "Products",
    "PC Knowledge",
    "Other",
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/* ─── Component ───────────────────────────────────────────── */
const ChatbotFAQ = () => {
    const [faqs, setFaqs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterCategory, setFilterCategory] = useState("all");

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);

    // Expand row
    const [expandedId, setExpandedId] = useState(null);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    /* ── Fetch ── */
    const fetchFaqs = async () => {
        setIsLoading(true);
        try {
            const res = await getAllFAQs();
            const data = res?.faqs ?? res?.data ?? res;
            setFaqs(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load FAQ list");
            setFaqs([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchFaqs(); }, []);

    /* ── Filter ── */
    const filtered = faqs.filter((f) => {
        const matchSearch =
            (f.question || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (f.answer || "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchCategory =
            filterCategory === "all" ||
            (f.category || "").toLowerCase() === filterCategory.toLowerCase();
        return matchSearch && matchCategory;
    });

    /* ── Pagination ── */
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const paginatedData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    // Reset to page 1 when search/filter changes
    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterCategory]);

    const getPageNumbers = () => {
        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    };

    /* ── Unique categories from data ── */
    const uniqueCategories = [...new Set(faqs.map((f) => f.category).filter(Boolean))];

    /* ── Open modal ── */
    const openCreate = () => {
        setFormData(EMPTY_FORM);
        setIsEditing(false);
        setEditingId(null);
        setShowModal(true);
    };

    const openEdit = (faq) => {
        setFormData({
            question: faq.question || "",
            answer: faq.answer || "",
            category: faq.category || "",
        });
        setIsEditing(true);
        setEditingId(faq.faq_id);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setFormData(EMPTY_FORM);
    };

    /* ── Form change ── */
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    /* ── Save ── */
    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.question.trim()) { toast.warning("Please enter a question"); return; }
        if (!formData.answer.trim()) { toast.warning("Please enter an answer"); return; }

        setIsSaving(true);
        try {
            const payload = {
                question: formData.question.trim(),
                answer: formData.answer.trim(),
                category: formData.category.trim() || null,
            };

            if (isEditing) {
                await updateFAQ(editingId, payload);
                toast.success("FAQ updated successfully");
            } else {
                await createFAQ(payload);
                toast.success("FAQ created successfully");
            }
            closeModal();
            fetchFaqs();
        } catch (err) {
            toast.error(err?.message ?? "Error saving FAQ");
        } finally {
            setIsSaving(false);
        }
    };

    /* ── Delete ── */
    const handleDelete = async (id, question) => {
        const shortQ = question.length > 50 ? question.substring(0, 50) + "..." : question;
        if (!window.confirm(`Delete FAQ "${shortQ}"?`)) return;
        try {
            await deleteFAQ(id);
            toast.success("FAQ deleted successfully");
            fetchFaqs();
        } catch {
            toast.error("Failed to delete FAQ");
        }
    };

    /* ── Toggle expand ── */
    const toggleExpand = (id) => {
        setExpandedId((prev) => (prev === id ? null : id));
    };

    /* ─── Render ─────────────────────────────────────────── */
    return (
        <div className="faq-container">
            {/* Header */}
            <div className="faq-header">
                <div className="faq-header-left">
                    <h2 className="faq-title">
                        <i className="bi bi-chat-dots-fill me-2" />
                        Chatbot FAQ Management
                    </h2>
                    <span className="faq-count">{filtered.length} FAQ</span>
                </div>
                <button className="faq-btn-create" onClick={openCreate}>
                    <i className="bi bi-plus-lg me-1" /> Add FAQ
                </button>
            </div>

            {/* Toolbar */}
            <div className="faq-toolbar">
                <div className="faq-search-wrap">
                    <i className="bi bi-search faq-search-icon" />
                    <input
                        className="faq-search"
                        placeholder="Search by question or answer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    className="faq-filter-select"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                >
                    <option value="all">All Categories</option>
                    {uniqueCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className="faq-card">
                {isLoading ? (
                    <div className="faq-loading">
                        <div className="faq-spinner" />
                        <span>Loading...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="faq-empty">
                        <i className="bi bi-chat-dots" />
                        <p>No FAQs found</p>
                    </div>
                ) : (
                    <div className="faq-table-wrap">
                        <table className="faq-table">
                            <thead>
                                <tr>
                                    <th style={{ width: "50px" }}>#</th>
                                    <th>Question</th>
                                    <th style={{ width: "140px" }}>Category</th>
                                    <th style={{ width: "100px" }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedData.map((f, idx) => (
                                    <React.Fragment key={f.faq_id}>
                                        <tr
                                            className={`faq-row ${expandedId === f.faq_id ? "faq-row-expanded" : ""}`}
                                            onClick={() => toggleExpand(f.faq_id)}
                                        >
                                            <td className="faq-id-cell">
                                                <span className="faq-id-badge">{(safePage - 1) * pageSize + idx + 1}</span>
                                            </td>
                                            <td className="faq-question-cell">
                                                <div className="faq-question-text">
                                                    <i className={`bi ${expandedId === f.faq_id ? "bi-chevron-down" : "bi-chevron-right"} faq-expand-icon`} />
                                                    {f.question}
                                                </div>
                                            </td>
                                            <td>
                                                {f.category && (
                                                    <span className="faq-category-badge">{f.category}</span>
                                                )}
                                            </td>
                                            <td className="faq-actions-cell" onClick={(e) => e.stopPropagation()}>
                                                <button className="faq-btn-edit" onClick={() => openEdit(f)} title="Edit">
                                                    <i className="bi bi-pencil" />
                                                </button>
                                                <button className="faq-btn-delete" onClick={() => handleDelete(f.faq_id, f.question)} title="Delete">
                                                    <i className="bi bi-trash" />
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedId === f.faq_id && (
                                            <tr className="faq-answer-row">
                                                <td></td>
                                                <td colSpan="3">
                                                    <div className="faq-answer-content">
                                                        <div className="faq-answer-label">
                                                            <i className="bi bi-chat-left-text me-1" /> Answer
                                                        </div>
                                                        <div className="faq-answer-text">{f.answer}</div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {!isLoading && filtered.length > 0 && (
                    <div className="faq-pagination">
                        <div className="faq-pagination-info">
                            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
                        </div>
                        <div className="faq-pagination-controls">
                            <button
                                className="faq-page-btn"
                                onClick={() => setCurrentPage(1)}
                                disabled={safePage === 1}
                                title="First"
                            >
                                <i className="bi bi-chevron-double-left" />
                            </button>
                            <button
                                className="faq-page-btn"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={safePage === 1}
                                title="Previous"
                            >
                                <i className="bi bi-chevron-left" />
                            </button>
                            {getPageNumbers()[0] > 1 && (
                                <span className="faq-page-ellipsis">…</span>
                            )}
                            {getPageNumbers().map((p) => (
                                <button
                                    key={p}
                                    className={`faq-page-btn ${p === safePage ? "faq-page-active" : ""}`}
                                    onClick={() => setCurrentPage(p)}
                                >
                                    {p}
                                </button>
                            ))}
                            {getPageNumbers()[getPageNumbers().length - 1] < totalPages && (
                                <span className="faq-page-ellipsis">…</span>
                            )}
                            <button
                                className="faq-page-btn"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={safePage === totalPages}
                                title="Next"
                            >
                                <i className="bi bi-chevron-right" />
                            </button>
                            <button
                                className="faq-page-btn"
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={safePage === totalPages}
                                title="Last"
                            >
                                <i className="bi bi-chevron-double-right" />
                            </button>
                        </div>
                        <div className="faq-page-size">
                            <select
                                className="faq-page-size-select"
                                value={pageSize}
                                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            >
                                {PAGE_SIZE_OPTIONS.map((s) => (
                                    <option key={s} value={s}>{s} / page</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="faq-modal-overlay" onClick={closeModal}>
                    <div className="faq-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="faq-modal-header">
                            <h3>{isEditing ? "Edit FAQ" : "Create New FAQ"}</h3>
                            <button className="faq-modal-close" onClick={closeModal}>
                                <i className="bi bi-x-lg" />
                            </button>
                        </div>

                        <form className="faq-modal-body" onSubmit={handleSave}>
                            {/* Category */}
                            <div className="faq-form-group">
                                <label>Category</label>
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    className="faq-input"
                                >
                                    <option value="">-- Select Category --</option>
                                    {CATEGORY_OPTIONS.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Question */}
                            <div className="faq-form-group">
                                <label>Question <span className="faq-required">*</span></label>
                                <textarea
                                    name="question"
                                    value={formData.question}
                                    onChange={handleChange}
                                    placeholder="Enter the FAQ question..."
                                    className="faq-input faq-textarea"
                                    rows={3}
                                />
                            </div>

                            {/* Answer */}
                            <div className="faq-form-group">
                                <label>Answer <span className="faq-required">*</span></label>
                                <textarea
                                    name="answer"
                                    value={formData.answer}
                                    onChange={handleChange}
                                    placeholder="Enter the answer..."
                                    className="faq-input faq-textarea faq-textarea-lg"
                                    rows={6}
                                />
                            </div>

                            {/* Preview */}
                            <div className="faq-preview">
                                <div className="faq-preview-label">Preview</div>
                                <div className="faq-preview-q">
                                    <i className="bi bi-question-circle me-1" />
                                    {formData.question || "Your question here..."}
                                </div>
                                <div className="faq-preview-a">
                                    <i className="bi bi-chat-left-text me-1" />
                                    {formData.answer || "Your answer here..."}
                                </div>
                            </div>

                            <div className="faq-modal-footer">
                                <button type="button" className="faq-btn-cancel" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="faq-btn-save" disabled={isSaving}>
                                    {isSaving ? (
                                        <><span className="faq-btn-spinner" /> Saving...</>
                                    ) : (
                                        <><i className="bi bi-check-lg me-1" />{isEditing ? "Update" : "Create"}</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatbotFAQ;
