import React, { useState, useRef } from 'react';
import { FaTimes, FaUndo, FaExchangeAlt, FaUpload, FaPaperPlane } from 'react-icons/fa';
import { toast } from 'react-toastify';
import axios from 'axios';
import { CreateReturnRequest } from '../../services/returnReqService';
import './ReturnReqModal.css';

const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dptatoir3/image/upload';
const UPLOAD_PRESET  = 'my_preset';
const MAX_IMAGES     = 5;

const ReturnReqModal = ({ item, onClose, onSuccess }) => {
    const [requestType, setRequestType] = useState('REFUND');
    const [reason, setReason]           = useState('');
    const [previews, setPreviews]       = useState([]); // [{ file, previewUrl }]
    const [submitting, setSubmitting]   = useState(false);
    const [uploadingImages, setUploadingImages] = useState(false);
    const fileInputRef = useRef(null);



    /* ── Handle file selection — local preview only, no upload yet ── */
    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const remaining = MAX_IMAGES - previews.length;
        if (remaining <= 0) {
            toast.warning(`Maximum ${MAX_IMAGES} images allowed.`);
            return;
        }

        const toAdd = files.slice(0, remaining).map(file => ({
            file,
            previewUrl: URL.createObjectURL(file),
        }));
        setPreviews(prev => [...prev, ...toAdd]);

        // Reset file input so the same file can be re-selected if removed
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    /* ── Xoá ảnh ── */
    const handleRemoveImage = (index) => {
        setPreviews(prev => {
            const updated = [...prev];
            URL.revokeObjectURL(updated[index].previewUrl);
            updated.splice(index, 1);
            return updated;
        });
    };

    /* ── Submit: upload images then call API ── */
    const handleSubmit = async () => {
        if (!reason.trim()) {
            toast.warning('Please enter a reason for your request.');
            return;
        }

        setSubmitting(true);
        try {
            // 1. Upload all selected images to Cloudinary
            let imagesStr = null;
            if (previews.length > 0) {
                setUploadingImages(true);
                const urls = await Promise.all(
                    previews.map(async (p) => {
                        const formData = new FormData();
                        formData.append('file', p.file);
                        formData.append('upload_preset', UPLOAD_PRESET);
                        const res = await axios.post(CLOUDINARY_URL, formData);
                        return res.data.secure_url;
                    })
                );
                setUploadingImages(false);
                imagesStr = urls.join(';');
            }

            // 2. Call the return request API
            const res = await CreateReturnRequest({
                order_item_id: item.id,
                request_type: requestType,
                reason: reason.trim(),
                images: imagesStr,
            });

            if (res && res.errCode === 0) {
                toast.success('Your request has been submitted successfully!');
                if (onSuccess) onSuccess(res.data);
                onClose();
            } else {
                toast.error(res?.message || 'Failed to submit request.');
            }
        } catch (err) {
            setUploadingImages(false);
            toast.error('An error occurred. Please try again.');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const productImage = item.productImage?.split('; ')[0] || '/default-image.jpg';

    return (
        <div className="rrm__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="rrm__modal" role="dialog" aria-modal="true">

                {/* ── Header ── */}
                <div className="rrm__header">
                    <div className="rrm__header-left">
                        <FaUndo className="rrm__header-icon" />
                        <h2>Request Return / Exchange</h2>
                    </div>
                    <button className="rrm__close-btn" onClick={onClose} aria-label="Close">
                        <FaTimes />
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="rrm__body">

                    {/* Product info (read-only) */}
                    <div className="rrm__product-card">
                        <img
                            className="rrm__product-img"
                            src={productImage}
                            alt={item.title}
                            onError={e => { e.target.src = '/default-image.jpg'; }}
                        />
                        <div className="rrm__product-info">
                            <p className="rrm__product-name">{item.title || 'Product'}</p>
                            <div className="rrm__product-meta">
                                <span>Qty: {item.quantity}</span>
                                <span>${Number(item.price || 0).toFixed(2)} / pc</span>
                            </div>
                            <p className="rrm__product-price">
                                Total: ${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}
                            </p>
                        </div>
                    </div>

                    {/* Request type */}
                    <div className="rrm__group">
                        <label className="rrm__label">
                            Request Type <span className="rrm__required">*</span>
                        </label>
                        <div className="rrm__type-selector">
                            <button
                                type="button"
                                className={`rrm__type-btn${requestType === 'REFUND' ? ' rrm__type-btn--active' : ''}`}
                                onClick={() => setRequestType('REFUND')}
                            >
                                <FaUndo />
                                Refund
                            </button>
                            <button
                                type="button"
                                className={`rrm__type-btn${requestType === 'EXCHANGE' ? ' rrm__type-btn--active' : ''}`}
                                onClick={() => setRequestType('EXCHANGE')}
                            >
                                <FaExchangeAlt />
                                Exchange
                            </button>
                        </div>
                    </div>

                    {/* Reason */}
                    <div className="rrm__group">
                        <label className="rrm__label">
                            Reason <span className="rrm__required">*</span>
                        </label>
                        <textarea
                            className="rrm__textarea"
                            placeholder="Describe in detail the reason for your return / exchange…"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            rows={4}
                        />
                    </div>

                    {/* Images */}
                    <div className="rrm__group">
                        <label className="rrm__label">
                            Images&nbsp;
                            <span style={{ fontWeight: 400, color: '#aaa' }}>(max {MAX_IMAGES} photos)</span>
                        </label>

                        {previews.length < MAX_IMAGES && (
                            <div
                                className="rrm__upload-area"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <label className="rrm__upload-label">
                                    <FaUpload />
                                    <span>Click to select images</span>
                                    <span style={{ fontSize: '0.75rem', color: '#bbb' }}>
                                        JPEG, PNG, WEBP – max 10 MB each
                                    </span>
                                </label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="rrm__upload-input"
                                    onChange={handleFileChange}
                                />
                            </div>
                        )}

                        {previews.length > 0 && (
                            <div className="rrm__img-preview-grid">
                                {previews.map((p, idx) => (
                                    <div key={idx} className="rrm__img-preview-item">
                                        <img src={p.previewUrl} alt={`preview-${idx}`} />
                                    <button
                                        className="rrm__img-remove-btn"
                                        onClick={() => handleRemoveImage(idx)}
                                        aria-label="Remove image"
                                        disabled={submitting || uploadingImages}
                                    >
                                        <FaTimes />
                                    </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <p className="rrm__img-count">
                            {previews.length}/{MAX_IMAGES} image{previews.length !== 1 ? 's' : ''} selected
                        </p>
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="rrm__footer">
                    <button className="rrm__btn rrm__btn--cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="rrm__btn rrm__btn--submit"
                        onClick={handleSubmit}
                        disabled={submitting || uploadingImages}
                    >
                        {uploadingImages ? (
                            <><div className="rrm__spinner" /> Uploading images…</>
                        ) : submitting ? (
                            <><div className="rrm__spinner" /> Submitting…</>
                        ) : (
                            <><FaPaperPlane /> Submit Request</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReturnReqModal;
