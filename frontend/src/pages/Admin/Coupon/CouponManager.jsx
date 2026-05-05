import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
    getAllCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
} from "../../../services/couponService.js";
import "./CouponManager.css";

/* ─── Helpers ─────────────────────────────────────────────── */
const formatDate = (val) => {
    if (!val) return "—";
    return new Date(val).toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
    });
};

const toInputDate = (val) => {
    if (!val) return "";
    return new Date(val).toISOString().slice(0, 10);
};

const EMPTY_FORM = {
    code: "",
    discount_type: "percent",
    discount_value: "",
    max_discount: "",
    min_order_value: "",
    usage_limit: "",
    start_date: "",
    end_date: "",
    is_active: 1,
};

/* ─── Component ───────────────────────────────────────────── */
const CouponManager = () => {
    const [coupons, setCoupons] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState("all");     // all | percent | fixed
    const [filterStatus, setFilterStatus] = useState("all"); // all | active | inactive

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);

    /* ── Fetch ── */
    const fetchCoupons = async () => {
        setIsLoading(true);
        try {
            const res = await getAllCoupons();
            const data = res?.data ?? res;
            setCoupons(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Không thể tải danh sách coupon");
            setCoupons([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchCoupons(); }, []);

    /* ── Filter ── */
    const filtered = coupons.filter((c) => {
        const matchSearch =
            c.code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchType =
            filterType === "all" || c.discount_type === filterType;
        const matchStatus =
            filterStatus === "all" ||
            (filterStatus === "active" && c.is_active) ||
            (filterStatus === "inactive" && !c.is_active);
        return matchSearch && matchType && matchStatus;
    });

    /* ── Open modal ── */
    const openCreate = () => {
        setFormData(EMPTY_FORM);
        setIsEditing(false);
        setEditingId(null);
        setShowModal(true);
    };

    const openEdit = (coupon) => {
        setFormData({
            code: coupon.code,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value ?? "",
            max_discount: coupon.max_discount ?? "",
            min_order_value: coupon.min_order_value ?? "",
            usage_limit: coupon.usage_limit ?? "",
            start_date: toInputDate(coupon.start_date),
            end_date: toInputDate(coupon.end_date),
            is_active: coupon.is_active ? 1 : 0,
        });
        setIsEditing(true);
        setEditingId(coupon.id);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setFormData(EMPTY_FORM);
    };

    /* ── Form change ── */
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? (checked ? 1 : 0) : value,
        }));
    };

    /* ── Save ── */
    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.code.trim()) { toast.warning("Vui lòng nhập mã coupon"); return; }
        if (!formData.discount_value) { toast.warning("Vui lòng nhập giá trị giảm"); return; }

        setIsSaving(true);
        try {
            const payload = {
                ...formData,
                discount_value: Number(formData.discount_value),
                max_discount: formData.max_discount !== "" ? Number(formData.max_discount) : null,
                min_order_value: formData.min_order_value !== "" ? Number(formData.min_order_value) : 0,
                usage_limit: formData.usage_limit !== "" ? Number(formData.usage_limit) : null,
                start_date: formData.start_date || null,
                end_date: formData.end_date || null,
            };

            if (isEditing) {
                await updateCoupon(editingId, payload);
                toast.success("Cập nhật coupon thành công");
            } else {
                await createCoupon(payload);
                toast.success("Tạo coupon thành công");
            }
            closeModal();
            fetchCoupons();
        } catch (err) {
            toast.error(err?.message ?? "Lỗi khi lưu coupon");
        } finally {
            setIsSaving(false);
        }
    };

    /* ── Delete ── */
    const handleDelete = async (id, code) => {
        if (!window.confirm(`Xoá coupon "${code}"?`)) return;
        try {
            await deleteCoupon(id);
            toast.success("Đã xoá coupon");
            fetchCoupons();
        } catch {
            toast.error("Không thể xoá coupon");
        }
    };

    /* ── Toggle active (quick inline) ── */
    const handleToggleActive = async (coupon) => {
        try {
            await updateCoupon(coupon.id, {
                code: coupon.code,
                discount_type: coupon.discount_type,
                discount_value: coupon.discount_value,
                max_discount: coupon.max_discount,
                min_order_value: coupon.min_order_value,
                usage_limit: coupon.usage_limit,
                start_date: toInputDate(coupon.start_date),
                end_date: toInputDate(coupon.end_date),
                is_active: coupon.is_active ? 0 : 1,
            });
            fetchCoupons();
        } catch {
            toast.error("Không thể cập nhật trạng thái");
        }
    };

    /* ─── Render ─────────────────────────────────────────── */
    return (
        <div className="cpn-container">
            {/* Header */}
            <div className="cpn-header">
                <div className="cpn-header-left">
                    <h2 className="cpn-title">
                        <i className="bi bi-ticket-perforated-fill me-2" />
                        Coupon Management
                    </h2>
                    <span className="cpn-count">{filtered.length} coupon</span>
                </div>
                <button className="cpn-btn-create" onClick={openCreate}>
                    <i className="bi bi-plus-lg me-1" /> Tạo Coupon
                </button>
            </div>

            {/* Toolbar */}
            <div className="cpn-toolbar">
                <div className="cpn-search-wrap">
                    <i className="bi bi-search cpn-search-icon" />
                    <input
                        className="cpn-search"
                        placeholder="Tìm theo mã coupon..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select className="cpn-filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="all">Tất cả loại</option>
                    <option value="percent">Phần trăm (%)</option>
                    <option value="fixed">Cố định ($)</option>
                </select>
                <select className="cpn-filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="all">Tất cả trạng thái</option>
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Đã tắt</option>
                </select>
            </div>

            {/* Table */}
            <div className="cpn-card">
                {isLoading ? (
                    <div className="cpn-loading">
                        <div className="cpn-spinner" />
                        <span>Đang tải...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="cpn-empty">
                        <i className="bi bi-ticket-perforated" />
                        <p>Không có coupon nào</p>
                    </div>
                ) : (
                    <div className="cpn-table-wrap">
                        <table className="cpn-table">
                            <thead>
                                <tr>
                                    <th>Mã</th>
                                    <th>Loại</th>
                                    <th>Giá trị</th>
                                    <th>Giảm tối đa</th>
                                    <th>Đơn tối thiểu</th>
                                    <th>Lượt dùng</th>
                                    <th>Hiệu lực</th>
                                    <th>Trạng thái</th>
                                    <th>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((c) => {
                                    const isExpired = c.end_date && new Date(c.end_date) < new Date();
                                    return (
                                        <tr key={c.id} className={!c.is_active ? "cpn-row-inactive" : ""}>
                                            <td>
                                                <span className="cpn-code-badge">{c.code}</span>
                                            </td>
                                            <td>
                                                <span className={`cpn-type-badge cpn-type-${c.discount_type}`}>
                                                    {c.discount_type === "percent" ? "%" : "$"}
                                                </span>
                                            </td>
                                            <td className="cpn-value-cell">
                                                {c.discount_type === "percent"
                                                    ? `${c.discount_value}%`
                                                    : `$${Number(c.discount_value).toFixed(2)}`}
                                            </td>
                                            <td>{c.max_discount != null ? `$${Number(c.max_discount).toFixed(2)}` : "—"}</td>
                                            <td>{c.min_order_value > 0 ? `$${Number(c.min_order_value).toFixed(2)}` : "—"}</td>
                                            <td>
                                                <span className="cpn-usage">
                                                    {c.used_count ?? 0}
                                                    {c.usage_limit != null ? ` / ${c.usage_limit}` : ""}
                                                </span>
                                            </td>
                                            <td className="cpn-date-cell">
                                                <span className={isExpired ? "cpn-expired" : ""}>
                                                    {formatDate(c.start_date)} → {formatDate(c.end_date)}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className={`cpn-status-toggle ${c.is_active ? "cpn-status-on" : "cpn-status-off"}`}
                                                    onClick={() => handleToggleActive(c)}
                                                    title={c.is_active ? "Click để tắt" : "Click để bật"}
                                                >
                                                    <span className="cpn-status-dot" />
                                                    {c.is_active ? "Hoạt động" : "Đã tắt"}
                                                </button>
                                            </td>
                                            <td className="cpn-actions-cell">
                                                <button className="cpn-btn-edit" onClick={() => openEdit(c)} title="Chỉnh sửa">
                                                    <i className="bi bi-pencil" />
                                                </button>
                                                <button className="cpn-btn-delete" onClick={() => handleDelete(c.id, c.code)} title="Xoá">
                                                    <i className="bi bi-trash" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="cpn-modal-overlay" onClick={closeModal}>
                    <div className="cpn-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="cpn-modal-header">
                            <h3>{isEditing ? "Chỉnh sửa Coupon" : "Tạo Coupon mới"}</h3>
                            <button className="cpn-modal-close" onClick={closeModal}>
                                <i className="bi bi-x-lg" />
                            </button>
                        </div>

                        <form className="cpn-modal-body" onSubmit={handleSave}>
                            {/* Row 1: Code + Type */}
                            <div className="cpn-form-row">
                                <div className="cpn-form-group">
                                    <label>Mã coupon <span className="cpn-required">*</span></label>
                                    <input
                                        name="code"
                                        value={formData.code}
                                        onChange={handleChange}
                                        placeholder="VD: SUMMER20"
                                        className="cpn-input"
                                        style={{ textTransform: "uppercase" }}
                                        disabled={isEditing}
                                    />
                                    {isEditing && <small className="cpn-hint">Không thể thay đổi mã</small>}
                                </div>
                                <div className="cpn-form-group">
                                    <label>Loại giảm <span className="cpn-required">*</span></label>
                                    <select name="discount_type" value={formData.discount_type} onChange={handleChange} className="cpn-input">
                                        <option value="percent">Phần trăm (%)</option>
                                        <option value="fixed">Cố định ($)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Row 2: Value + Max discount */}
                            <div className="cpn-form-row">
                                <div className="cpn-form-group">
                                    <label>
                                        Giá trị giảm <span className="cpn-required">*</span>
                                        <span className="cpn-unit">
                                            {formData.discount_type === "percent" ? "(%)" : "($)"}
                                        </span>
                                    </label>
                                    <input
                                        name="discount_value"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.discount_value}
                                        onChange={handleChange}
                                        placeholder={formData.discount_type === "percent" ? "VD: 10" : "VD: 5.00"}
                                        className="cpn-input"
                                    />
                                </div>
                                <div className="cpn-form-group">
                                    <label>
                                        Giảm tối đa ($)
                                        {formData.discount_type === "fixed" && <span className="cpn-hint-inline"> (không áp dụng)</span>}
                                    </label>
                                    <input
                                        name="max_discount"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.max_discount}
                                        onChange={handleChange}
                                        placeholder="Không giới hạn"
                                        className="cpn-input"
                                        disabled={formData.discount_type === "fixed"}
                                    />
                                </div>
                            </div>

                            {/* Row 3: Min order + Usage limit */}
                            <div className="cpn-form-row">
                                <div className="cpn-form-group">
                                    <label>Đơn hàng tối thiểu ($)</label>
                                    <input
                                        name="min_order_value"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.min_order_value}
                                        onChange={handleChange}
                                        placeholder="Không giới hạn"
                                        className="cpn-input"
                                    />
                                </div>
                                <div className="cpn-form-group">
                                    <label>Giới hạn lượt dùng</label>
                                    <input
                                        name="usage_limit"
                                        type="number"
                                        min="1"
                                        value={formData.usage_limit}
                                        onChange={handleChange}
                                        placeholder="Không giới hạn"
                                        className="cpn-input"
                                    />
                                </div>
                            </div>

                            {/* Row 4: Dates */}
                            <div className="cpn-form-row">
                                <div className="cpn-form-group">
                                    <label>Ngày bắt đầu</label>
                                    <input
                                        name="start_date"
                                        type="date"
                                        value={formData.start_date}
                                        onChange={handleChange}
                                        className="cpn-input"
                                    />
                                </div>
                                <div className="cpn-form-group">
                                    <label>Ngày kết thúc</label>
                                    <input
                                        name="end_date"
                                        type="date"
                                        value={formData.end_date}
                                        onChange={handleChange}
                                        className="cpn-input"
                                    />
                                </div>
                            </div>

                            {/* Active toggle */}
                            <div className="cpn-form-group cpn-form-group-inline">
                                <label className="cpn-checkbox-label">
                                    <input
                                        type="checkbox"
                                        name="is_active"
                                        checked={!!formData.is_active}
                                        onChange={handleChange}
                                        className="cpn-checkbox"
                                    />
                                    <span>Kích hoạt coupon ngay</span>
                                </label>
                            </div>

                            {/* Preview box */}
                            <div className="cpn-preview">
                                <span className="cpn-preview-label">Xem trước:</span>
                                <span className="cpn-code-badge">{formData.code || "CODE"}</span>
                                <span className="cpn-preview-value">
                                    {formData.discount_type === "percent"
                                        ? `Giảm ${formData.discount_value || 0}%${formData.max_discount ? ` (tối đa $${formData.max_discount})` : ""}`
                                        : `Giảm $${formData.discount_value || "0.00"}`}
                                </span>
                            </div>

                            <div className="cpn-modal-footer">
                                <button type="button" className="cpn-btn-cancel" onClick={closeModal}>Huỷ</button>
                                <button type="submit" className="cpn-btn-save" disabled={isSaving}>
                                    {isSaving ? (
                                        <><span className="cpn-btn-spinner" /> Đang lưu...</>
                                    ) : (
                                        <><i className="bi bi-check-lg me-1" />{isEditing ? "Cập nhật" : "Tạo mới"}</>
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

export default CouponManager;
