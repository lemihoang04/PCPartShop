import React, { useState } from 'react';
import { FaTimes, FaUndo, FaExclamationCircle, FaBan } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { CancelReturnRequest } from '../../services/returnReqService';
import ImageModal from '../../components/ImageModal/ImageModal';
import './ReturnStatusModal.css';

const STATUS_LABEL = {
    PENDING:   'Pending',
    APPROVED:  'Approved',
    REJECTED:  'Rejected',
    RECEIVED:  'Received',
    COMPLETED: 'Completed',
    FAILED:    'Failed',
};

const ReturnStatusModal = ({ returnRequest, onClose, onCancelled }) => {
    const [cancelling, setCancelling] = useState(false);
    const [imageViewer, setImageViewer] = useState({ open: false, index: 0 });

    const handleCancel = async () => {
        if (!window.confirm('Are you sure you want to cancel this request?')) return;
        setCancelling(true);
        try {
            const res = await CancelReturnRequest(returnRequest.request_id);
            if (res && res.errCode === 0) {
                toast.success('Request cancelled successfully.');
                if (onCancelled) onCancelled(returnRequest.request_id);
                onClose();
            } else {
                toast.error(res?.message || 'Failed to cancel request.');
            }
        } catch {
            toast.error('An error occurred. Please try again.');
        } finally {
            setCancelling(false);
        }
    };

    const status   = returnRequest.status || 'PENDING';
    const images   = returnRequest.images
        ? returnRequest.images.split(';').filter(Boolean)
        : [];
    const isPending = status === 'PENDING';

    return (
        <div className="rsm__overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="rsm__modal" role="dialog" aria-modal="true">

                {/* ── Header ── */}
                <div className="rsm__header">
                    <div className="rsm__header-left">
                        <FaUndo className="rsm__header-icon" />
                        <h2>Return Request Status</h2>
                    </div>
                    <button className="rsm__close-btn" onClick={onClose} aria-label="Close">
                        <FaTimes />
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="rsm__body">

                    {/* Status + type */}
                    <div className="rsm__status-row">
                        <span className={`rsm__status-badge rsm__badge--${status}`}>
                            {STATUS_LABEL[status] || status}
                        </span>
                        <span className="rsm__type-chip">{returnRequest.request_type}</span>
                    </div>

                    {/* Info block */}
                    <div className="rsm__info-block">
                        <div className="rsm__info-row">
                            <span className="rsm__info-label">Product</span>
                            <span className="rsm__info-value">{returnRequest.product_name || '—'}</span>
                        </div>
                        <div className="rsm__info-row">
                            <span className="rsm__info-label">Quantity</span>
                            <span className="rsm__info-value">{returnRequest.quantity}</span>
                        </div>
                        {returnRequest.refund_amount != null && (
                            <div className="rsm__info-row">
                                <span className="rsm__info-label">Refund Amount</span>
                                <span className="rsm__info-value rsm__refund-amount">
                                    ${Number(returnRequest.refund_amount).toFixed(2)}
                                </span>
                            </div>
                        )}
                        <div className="rsm__info-row">
                            <span className="rsm__info-label">Reason</span>
                            <span className="rsm__info-value">{returnRequest.reason}</span>
                        </div>
                        <div className="rsm__info-row">
                            <span className="rsm__info-label">Submitted</span>
                            <span className="rsm__info-value">
                                {new Date(returnRequest.created_at).toLocaleDateString(undefined, {
                                    year: 'numeric', month: 'short', day: 'numeric',
                                })}
                            </span>
                        </div>
                    </div>

                    {/* Admin note */}
                    {returnRequest.admin_note && (
                        <div className="rsm__admin-note">
                            <div className="rsm__admin-note-label">
                                <FaExclamationCircle /> Admin Note
                            </div>
                            {returnRequest.admin_note}
                        </div>
                    )}

                    {/* Images */}
                    {images.length > 0 && (
                        <div>
                            <p className="rsm__images-label">Attached Images ({images.length})</p>
                            <div className="rsm__images-grid">
                                {images.map((url, i) => (
                                    <img
                                        key={i}
                                        className="rsm__img-thumb"
                                        src={url}
                                        alt={`evidence-${i + 1}`}
                                        onClick={() => setImageViewer({ open: true, index: i })}
                                        title="Click to open full size"
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="rsm__footer">
                    <button className="rsm__btn rsm__btn--close" onClick={onClose}>
                        Close
                    </button>
                    {isPending && (
                        <button
                            className="rsm__btn rsm__btn--cancel"
                            onClick={handleCancel}
                            disabled={cancelling}
                        >
                            {cancelling
                                ? <><div className="rsm__spinner" /> Cancelling…</>
                                : <><FaBan /> Cancel Request</>
                            }
                        </button>
                    )}
                </div>
            </div>

            {/* ── Image Viewer Modal ── */}
            {imageViewer.open && (
                <ImageModal
                    images={images}
                    initialIndex={imageViewer.index}
                    onClose={() => setImageViewer({ open: false, index: 0 })}
                />
            )}
        </div>
    );
};

export default ReturnStatusModal;
