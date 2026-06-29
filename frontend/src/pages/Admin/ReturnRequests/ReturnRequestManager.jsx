import React, { useEffect, useState, useMemo } from "react";
import { toast } from "react-toastify";
import axios from "../../../setup/axios";
import {
    FaUndo, FaEye, FaCheck, FaTimes, FaArrowRight,
    FaChevronDown, FaChevronUp,
} from "react-icons/fa";
import ImageModal from "../../../components/ImageModal/ImageModal";
import "./ReturnRequestManager.css";

// ── Status flow ──────────────────────────────────────────────
const EXCHANGE_FLOW = {
    PENDING:  "APPROVED",
    APPROVED: "RECEIVED",
    RECEIVED: "SHIPPING",
    SHIPPING: "COMPLETED",
};
const REFUND_FLOW = {
    PENDING:  "APPROVED",
    APPROVED: "RECEIVED",
    RECEIVED: "COMPLETED",
};

const nextStatus = (rr) => {
    const flow = rr.request_type === "REFUND" ? REFUND_FLOW : EXCHANGE_FLOW;
    return flow[rr.status] || null;
};

const STATUS_LABEL = {
    PENDING:   "Pending",
    APPROVED:  "Approved",
    RECEIVED:  "Received",
    SHIPPING:  "Shipping",
    COMPLETED: "Completed",
    REJECTED:  "Rejected",
    FAILED:    "Failed",
};

const ALL_STATUSES = Object.keys(STATUS_LABEL);

// ── API helpers ──────────────────────────────────────────────
const fetchAll = () => axios.get("/admin/return-requests");
const updateStatus = (id, status, admin_note) =>
    axios.post(`/admin/return-requests/${id}/status`, { status, admin_note });

// ─────────────────────────────────────────────────────────────
const ReturnRequestManager = () => {
    const [requests, setRequests]       = useState([]);
    const [loading, setLoading]         = useState(false);
    const [searchTerm, setSearchTerm]   = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterType, setFilterType]   = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    // Detail modal
    const [detailItem, setDetailItem]   = useState(null);
    const [adminNote, setAdminNote]     = useState("");

    // Confirm dialog
    const [confirm, setConfirm] = useState({
        open: false, id: null, newStatus: null, label: "", danger: false,
    });
    const [acting, setActing] = useState(false);

    // Image viewer modal
    const [imageViewer, setImageViewer] = useState({ open: false, images: [], index: 0 });

    // ── Fetch ────────────────────────────────────────────────
    const loadData = async () => {
        setLoading(true);
        try {
            const res = await fetchAll();
            if (res && res.errCode === 0) setRequests(res.data || []);
            else toast.error("Failed to load return requests.");
        } catch {
            toast.error("Error loading return requests.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    // ── Filter + search ──────────────────────────────────────
    const filtered = useMemo(() => {
        let list = [...requests];
        if (filterStatus !== "all")
            list = list.filter(r => r.status === filterStatus);
        if (filterType !== "all")
            list = list.filter(r => r.request_type === filterType);
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            list = list.filter(r =>
                String(r.request_id).includes(q) ||
                (r.user_name || "").toLowerCase().includes(q) ||
                (r.product_name || "").toLowerCase().includes(q)
            );
        }
        return list;
    }, [requests, filterStatus, filterType, searchTerm]);

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const pageItems  = filtered.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
    );

    // ── Confirm dialog helpers ───────────────────────────────
    const askConfirm = (id, newSt, label, danger = false) => {
        setConfirm({ open: true, id, newStatus: newSt, label, danger });
    };
    const closeConfirm = () =>
        setConfirm({ open: false, id: null, newStatus: null, label: "", danger: false });

    const executeUpdate = async () => {
        const { id, newStatus } = confirm;
        closeConfirm();
        setActing(true);
        try {
            const note = adminNote.trim() || null;
            const res  = await updateStatus(id, newStatus, note);
            if (res && res.errCode === 0) {
                toast.success(`Status updated to ${newStatus}.`);
                setRequests(prev =>
                    prev.map(r =>
                        r.request_id === id ? { ...r, status: newStatus } : r
                    )
                );
                if (detailItem?.request_id === id)
                    setDetailItem(prev => ({ ...prev, status: newStatus }));
            } else {
                toast.error(res?.message || "Update failed.");
            }
        } catch (e) {
            toast.error(e?.message || "Error updating status.");
        } finally {
            setActing(false);
        }
    };

    // ── Open detail ──────────────────────────────────────────
    const openDetail = (rr) => {
        setDetailItem(rr);
        setAdminNote(rr.admin_note || "");
    };
    const closeDetail = () => { setDetailItem(null); setAdminNote(""); };

    // ── Render helpers ───────────────────────────────────────
    const fmtDate = (d) => d ? new Date(d).toLocaleString() : "—";
    const fmtMoney = (n) =>
        n != null ? `$${Number(n).toFixed(2)}` : "—";

    const ActionButtons = ({ rr }) => {
        const next = nextStatus(rr);
        const canReject = rr.status === "PENDING";
        const isTerminal = ["COMPLETED", "REJECTED", "FAILED"].includes(rr.status);
        return (
            <div className="rrm-actions-cell">
                <button
                    className="rrm-btn-action rrm-btn-view"
                    onClick={() => openDetail(rr)}
                    title="View detail"
                >
                    <FaEye />
                </button>
                {!isTerminal && next && (
                    <button
                        className={`rrm-btn-action ${next === "COMPLETED" ? "rrm-btn-complete" : "rrm-btn-advance"}`}
                        onClick={() => askConfirm(
                            rr.request_id, next,
                            `Advance to ${STATUS_LABEL[next]}?`
                        )}
                        title={`→ ${next}`}
                        disabled={acting}
                    >
                        {next === "COMPLETED" ? <FaCheck /> : <FaArrowRight />}
                        {STATUS_LABEL[next]}
                    </button>
                )}
                {canReject && (
                    <button
                        className="rrm-btn-action rrm-btn-reject"
                        onClick={() => askConfirm(
                            rr.request_id, "REJECTED",
                            "Reject this return request?", true
                        )}
                        title="Reject"
                        disabled={acting}
                    >
                        <FaTimes /> Reject
                    </button>
                )}
            </div>
        );
    };

    // ────────────────────────────────────────────────────────
    return (
        <div className="rrm-container">
            {/* Header */}
            <div className="rrm-header">
                <div className="rrm-header-left">
                    <h2 className="rrm-title">
                        <FaUndo /> Return Request Management
                    </h2>
                    <span className="rrm-count">{filtered.length} requests</span>
                </div>
            </div>

            {/* Toolbar */}
            <div className="rrm-toolbar">
                <div className="rrm-search-wrap">
                    <i className="bi bi-search rrm-search-icon" />
                    <input
                        className="rrm-search"
                        placeholder="Search by ID, customer, product…"
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                </div>
                <select
                    className="rrm-filter-select"
                    value={filterType}
                    onChange={e => { setFilterType(e.target.value); setCurrentPage(1); }}
                >
                    <option value="all">All Types</option>
                    <option value="REFUND">Refund</option>
                    <option value="EXCHANGE">Exchange</option>
                </select>
                <select
                    className="rrm-filter-select"
                    value={filterStatus}
                    onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                >
                    <option value="all">All Statuses</option>
                    {ALL_STATUSES.map(s => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className="rrm-card">
                {loading ? (
                    <div className="rrm-loading">
                        <div className="rrm-spinner" />
                        <span>Loading…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rrm-empty">
                        <FaUndo style={{ fontSize: "2rem", opacity: 0.35 }} />
                        <p>No return requests found</p>
                    </div>
                ) : (
                    <>
                        <div className="rrm-table-wrap">
                            <table className="rrm-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Customer</th>
                                        <th>Product</th>
                                        <th>Type</th>
                                        <th>Status</th>
                                        <th>Refund Amt</th>
                                        <th>Payment</th>
                                        <th>Date</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageItems.map(rr => (
                                        <tr key={rr.request_id}>
                                            <td>
                                                <span className="rrm-code-badge">
                                                    #{rr.request_id}
                                                </span>
                                            </td>
                                            <td>{rr.user_name || `User #${rr.user_id}`}</td>
                                            <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {rr.product_name || `Product #${rr.product_id}`}
                                            </td>
                                            <td>
                                                <span className={`rrm-type-badge rrm-type-${rr.request_type}`}>
                                                    {rr.request_type}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`rrm-status-badge rrm-status-${rr.status}`}>
                                                    <span className="rrm-status-dot" />
                                                    {STATUS_LABEL[rr.status] || rr.status}
                                                </span>
                                            </td>
                                            <td>{fmtMoney(rr.refund_amount)}</td>
                                            <td>{rr.payment_method === "online_payment" ? "Online" : rr.payment_method === "pay_later" ? "Pay Later" : rr.payment_method || "—"}</td>
                                            <td style={{ fontSize: "0.78rem", color: "#64748b", whiteSpace: "nowrap" }}>
                                                {fmtDate(rr.created_at)}
                                            </td>
                                            <td><ActionButtons rr={rr} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="rrm-pagination">
                                <span className="rrm-page-info">
                                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                                </span>
                                <div className="rrm-page-controls">
                                    <button
                                        className="rrm-page-btn"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => p - 1)}
                                    >Prev</button>
                                    {[...Array(totalPages)].map((_, i) => (
                                        <button
                                            key={i}
                                            className={`rrm-page-btn ${currentPage === i + 1 ? "active" : ""}`}
                                            onClick={() => setCurrentPage(i + 1)}
                                        >{i + 1}</button>
                                    ))}
                                    <button
                                        className="rrm-page-btn"
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(p => p + 1)}
                                    >Next</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Detail Modal ── */}
            {detailItem && (
                <div className="rrm-modal-overlay" onClick={e => e.target === e.currentTarget && closeDetail()}>
                    <div className="rrm-modal">
                        <div className="rrm-modal-header">
                            <h3>Return Request #{detailItem.request_id}</h3>
                            <button className="rrm-modal-close" onClick={closeDetail}><FaTimes /></button>
                        </div>
                        <div className="rrm-modal-body">
                            {[
                                ["Customer",    detailItem.user_name || `User #${detailItem.user_id}`],
                                ["Product",     detailItem.product_name],
                                ["Quantity",    detailItem.quantity],
                                ["Type",        detailItem.request_type],
                                ["Status",      STATUS_LABEL[detailItem.status] || detailItem.status],
                                ["Refund Amt",  fmtMoney(detailItem.refund_amount)],
                                ["Payment",     detailItem.payment_method === "online_payment" ? "Online (Stripe)" : detailItem.payment_method === "pay_later" ? "Pay Later (COD)" : (detailItem.payment_method || "—")],
                                ["Reason",      detailItem.reason],
                                ["Created",     fmtDate(detailItem.created_at)],
                                ["Updated",     fmtDate(detailItem.updated_at)],
                            ].map(([label, val]) => (
                                <div className="rrm-modal-row" key={label}>
                                    <span className="rrm-modal-label">{label}</span>
                                    <span className="rrm-modal-value">{val || "—"}</span>
                                </div>
                            ))}

                            {detailItem.stripe_refund_id && (
                                <div className="rrm-modal-row">
                                    <span className="rrm-modal-label">Stripe Refund</span>
                                    <span className="rrm-modal-value" style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
                                        {detailItem.stripe_refund_id}
                                    </span>
                                </div>
                            )}

                            {/* Images */}
                            {detailItem.images && (
                                <div>
                                    <div className="rrm-modal-row" style={{ marginBottom: 6 }}>
                                        <span className="rrm-modal-label">Images</span>
                                    </div>
                                    <div className="rrm-modal-img-grid">
                                        {detailItem.images.split(";").filter(Boolean).map((url, i) => (
                                            <img
                                                key={i}
                                                className="rrm-modal-img"
                                                src={url}
                                                alt={`evidence-${i + 1}`}
                                                onClick={() => setImageViewer({ open: true, images: detailItem.images.split(";").filter(Boolean), index: i })}
                                                title="Click to open full size"
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Admin note */}
                            <div>
                                <div className="rrm-modal-row" style={{ marginBottom: 6 }}>
                                    <span className="rrm-modal-label">Admin Note</span>
                                </div>
                                <textarea
                                    className="rrm-modal-note-input"
                                    placeholder="Optional note for this action…"
                                    value={adminNote}
                                    onChange={e => setAdminNote(e.target.value)}
                                />
                            </div>

                            {/* Quick actions inside modal */}
                            {(() => {
                                const next = nextStatus(detailItem);
                                const canReject = detailItem.status === "PENDING";
                                const isTerminal = ["COMPLETED", "REJECTED", "FAILED"].includes(detailItem.status);
                                if (isTerminal) return null;
                                return (
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                                        {next && (
                                            <button
                                                className={`rrm-modal-btn ${next === "COMPLETED" ? "rrm-btn-complete" : "rrm-btn-advance"}`}
                                                style={{ padding: "8px 16px", borderRadius: 9 }}
                                                disabled={acting}
                                                onClick={() => {
                                                    closeDetail();
                                                    askConfirm(detailItem.request_id, next, `Advance to ${STATUS_LABEL[next]}?`);
                                                }}
                                            >
                                                {next === "COMPLETED" ? <FaCheck /> : <FaArrowRight />}
                                                Advance → {STATUS_LABEL[next]}
                                            </button>
                                        )}
                                        {canReject && (
                                            <button
                                                className="rrm-btn-action rrm-btn-reject"
                                                style={{ padding: "8px 16px", borderRadius: 9 }}
                                                disabled={acting}
                                                onClick={() => {
                                                    closeDetail();
                                                    askConfirm(detailItem.request_id, "REJECTED", "Reject this return request?", true);
                                                }}
                                            >
                                                <FaTimes /> Reject
                                            </button>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="rrm-modal-footer">
                            <button className="rrm-modal-btn rrm-modal-btn-close" onClick={closeDetail}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Confirm Dialog ── */}
            {confirm.open && (
                <div className="rrm-confirm-overlay">
                    <div className="rrm-confirm-box">
                        <h4>Confirm Action</h4>
                        <p>{confirm.label}</p>
                        {confirm.newStatus === "COMPLETED" && (
                            <p style={{ fontSize: "0.82rem", color: "#7c3aed", marginTop: -12, marginBottom: 16 }}>
                                ⚠ If payment method is online, Stripe refund will be triggered automatically.
                            </p>
                        )}
                        <div className="rrm-confirm-btns">
                            <button className="rrm-confirm-cancel" onClick={closeConfirm}>Cancel</button>
                            <button
                                className={`rrm-confirm-ok ${confirm.danger ? "danger" : ""}`}
                                onClick={executeUpdate}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Image Viewer Modal ── */}
            {imageViewer.open && (
                <ImageModal
                    images={imageViewer.images}
                    initialIndex={imageViewer.index}
                    onClose={() => setImageViewer({ open: false, images: [], index: 0 })}
                />
            )}
        </div>
    );
};

export default ReturnRequestManager;
