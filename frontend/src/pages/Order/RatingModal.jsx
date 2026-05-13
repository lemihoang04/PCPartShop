import React, { useState } from "react";
import "./RatingModal.css";
import { toast } from "react-toastify";
import { FaStar, FaTimes, FaBox, FaCommentAlt, FaCheckCircle } from "react-icons/fa";

const RatingModal = ({ order, onClose, onSubmit }) => {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comment, setComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleRatingChange = (newRating) => {
        setRating(newRating);
    };

    const handleSubmit = async () => {
        if (rating === 0) {
            toast.error("Please select a rating before submitting");
            return;
        }

        setIsSubmitting(true);

        try {
            // Call the onSubmit function passed from the parent component
            await onSubmit({
                userId: order.userId,
                orderId: order.id,
                productId: order.productId,
                rating,
                comment
            });

            toast.success("Thank you for your feedback!");
            onClose();
        } catch (error) {
            toast.error("Failed to submit rating. Please try again.");
            console.error("Rating submission error:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getRatingLabel = (val) => {
        const labels = {
            1: "Poor",
            2: "Fair",
            3: "Good",
            4: "Very Good",
            5: "Excellent"
        };
        return labels[val] || "";
    };

    return (
        <div className="rmdl__overlay" onClick={onClose}>
            <div className="rmdl__content" onClick={(e) => e.stopPropagation()}>
                <div className="rmdl__header">
                    <h2><FaStar className="rmdl__header-icon" /> Rate Your Experience</h2>
                    <button className="rmdl__close-btn" onClick={onClose}><FaTimes /></button>
                </div>

                <div className="rmdl__body">
                    <div className="rmdl__product-card">
                        <div className="rmdl__product-img">
                            <img
                                src={order.productImage?.split("; ")[0] || "/default-image.jpg"}
                                alt={order.title || "Product"}
                                onError={(e) => { e.target.src = "/default-image.jpg"; }}
                            />
                        </div>
                        <div className="rmdl__product-info">
                            <h3>{order.title}</h3>
                            <p className="rmdl__order-num">Order #{order.orderNumber || order.order_id}</p>
                        </div>
                    </div>

                    <div className="rmdl__rating-section">
                        <p className="rmdl__prompt">How would you rate this product?</p>
                        <div className="rmdl__stars">
                            {[...Array(5)].map((_, index) => {
                                const ratingValue = index + 1;
                                return (
                                    <FaStar
                                        key={index}
                                        className={`rmdl__star ${ratingValue <= (hover || rating) ? "active" : ""}`}
                                        onClick={() => handleRatingChange(ratingValue)}
                                        onMouseEnter={() => setHover(ratingValue)}
                                        onMouseLeave={() => setHover(0)}
                                    />
                                );
                            })}
                        </div>
                        <div className="rmdl__rating-label">
                            {getRatingLabel(hover || rating)}
                        </div>
                    </div>

                    <div className="rmdl__comment-section">
                        <label htmlFor="comment"><FaCommentAlt /> Share your thoughts (optional)</label>
                        <textarea
                            id="comment"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Tell us what you liked or disliked about this product..."
                            rows={4}
                        />
                    </div>
                </div>

                <div className="rmdl__footer">
                    <button
                        className="rmdl__btn rmdl__btn-secondary"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        className="rmdl__btn rmdl__btn-primary"
                        onClick={handleSubmit}
                        disabled={isSubmitting || rating === 0}
                    >
                        {isSubmitting ? "Submitting..." : (
                            <><FaCheckCircle /> Submit Rating</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RatingModal;