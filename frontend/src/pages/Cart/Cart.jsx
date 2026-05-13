import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { UserContext } from "../../context/UserProvider";
import { toast } from 'react-toastify';
import { loadCart, removeFromCart, checkOutStock } from '../../services/apiService';
import {
    FaTrash, FaMinus, FaPlus, FaShoppingCart,
    FaExclamationTriangle, FaTimes, FaArrowRight
} from 'react-icons/fa';
import './Cart.css';

const CartPage = () => {
    const navigate = useNavigate();
    const [cartItems, setCartItems] = useState([]);
    const { user, fetchUser } = useContext(UserContext);
    const [selectedItems, setSelectedItems] = useState([]);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [outOfStockModal, setOutOfStockModal] = useState({ open: false, items: [] });

    useEffect(() => {
        if (user && user.account.id) {
            const loadCartData = async () => {
                try {
                    const response = await loadCart(user.account.id);
                    if (response && response.errCode === 0) {
                        setCartItems(response.data);
                    } else {
                        toast.error("Failed to load cart items.");
                    }
                } catch (error) {
                    console.error('Error loading cart:', error);
                    toast.error("Failed to load cart items.");
                }
            };
            loadCartData();
        }
    }, [user]);

    const handleCheckboxChange = (id) => {
        setSelectedItems((prev) =>
            prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
        );
    };

    const handleCheckoutClick = async () => {
        if (selectedItems.length === 0) {
            toast.error("Please select at least one item to proceed to checkout.");
            return;
        }
        if (isCheckingOut) return;

        setIsCheckingOut(true);

        const formValue = {
            items: cartItems.filter(item => selectedItems.includes(item.cart_id)),
            amount: calculateSubtotal(),
        };

        try {
            const checkOutStockRes = await checkOutStock(formValue.items);
            if (checkOutStockRes.errCode === 0) {
                setTimeout(() => {
                    navigate("/checkout", { state: { formValue } });
                }, 500);
            } else if (checkOutStockRes.errCode === 1) {
                // Some items are out of stock — show modal
                setOutOfStockModal({ open: true, items: checkOutStockRes.outOfStock || [] });
                setIsCheckingOut(false);
            } else {
                toast.error("Stock check failed. Please try again.");
                setIsCheckingOut(false);
            }
        } catch (error) {
            console.error('Error checking stock:', error);
            toast.error("Unable to check stock. Please try again.");
            setIsCheckingOut(false);
        }
    };

    const handleDeleteClick = async (cart_id) => {
        try {
            const response = await removeFromCart(cart_id);
            if (response && response.errCode === 0) {
                setCartItems((prev) => prev.filter((item) => item.cart_id !== cart_id));
                setSelectedItems((prev) => prev.filter((id) => id !== cart_id));
                toast.success("Item removed from cart.");
                fetchUser();
            } else {
                toast.error("Failed to remove item.");
            }
        } catch (error) {
            console.error('Error deleting item:', error);
            toast.error("Failed to remove item.");
        }
    };

    const handleSelectToggle = () => {
        if (selectedItems.length === cartItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(cartItems.map((item) => item.cart_id));
        }
    };

    const calculateSubtotal = () => {
        return cartItems
            .filter((item) => selectedItems.includes(item.cart_id))
            .reduce((total, item) => total + Number(item.price) * item.quantity, 0)
            .toFixed(2);
    };

    const handleQuantityChange = (product_id, delta) => {
        setCartItems(
            cartItems.map((item) => {
                if (item.product_id === product_id) {
                    const newQuantity = Math.max(1, item.quantity + delta);
                    return { ...item, quantity: newQuantity };
                }
                return item;
            })
        );
    };

    const allSelected = cartItems.length > 0 && selectedItems.length === cartItems.length;

    return (
        <div className="crt__container">
            <div className="crt__content">

                {/* ── Left: Cart Items ── */}
                <div className="crt__items-container">
                    <div className="crt__header">
                        <FaShoppingCart className="crt__header-icon" />
                        <h2 className="crt__title">Shopping Cart</h2>
                        {cartItems.length > 0 && (
                            <span className="crt__item-count">{cartItems.length} item{cartItems.length !== 1 ? 's' : ''}</span>
                        )}
                    </div>

                    {cartItems.length > 0 && (
                        <div className="crt__select-all">
                            <label className="crt__select-label">
                                <input
                                    type="checkbox"
                                    className="crt__checkbox"
                                    checked={allSelected}
                                    onChange={handleSelectToggle}
                                />
                                <span>Select all items</span>
                            </label>
                        </div>
                    )}

                    {cartItems.length === 0 ? (
                        <div className="crt__empty">
                            <FaShoppingCart className="crt__empty-icon" />
                            <h3>Your cart is empty</h3>
                            <p>Browse our products and add something you like!</p>
                            <button className="crt__shop-btn" onClick={() => navigate('/products')}>
                                Start Shopping <FaArrowRight />
                            </button>
                        </div>
                    ) : (
                        <div className="crt__items-list">
                            {cartItems.map((item) => (
                                <div
                                    key={item.cart_id}
                                    className={`crt__item${selectedItems.includes(item.cart_id) ? ' crt__item--selected' : ''}`}
                                >
                                    {/* Checkbox */}
                                    <div className="crt__item-checkbox">
                                        <input
                                            type="checkbox"
                                            className="crt__checkbox"
                                            checked={selectedItems.includes(item.cart_id)}
                                            onChange={() => handleCheckboxChange(item.cart_id)}
                                        />
                                    </div>

                                    {/* Image */}
                                    <div className="crt__item-image">
                                        <img
                                            src={item.image ? item.image.split("; ")[0] : "default-image.jpg"}
                                            alt={item.title}
                                            onClick={() => navigate(`/product-info/${item.product_id}`)}
                                        />
                                    </div>

                                    {/* Details */}
                                    <div className="crt__item-details">
                                        <h3
                                            className="crt__item-name"
                                            onClick={() => navigate(`/product-info/${item.product_id}`)}
                                        >
                                            {item.title}
                                        </h3>

                                        <div className="crt__item-bottom">
                                            {/* Quantity control */}
                                            <div className="crt__quantity-control">
                                                <button
                                                    className="crt__quantity-btn"
                                                    onClick={() => handleQuantityChange(item.product_id, -1)}
                                                    disabled={item.quantity <= 1}
                                                >
                                                    <FaMinus />
                                                </button>
                                                <span className="crt__quantity-value">{item.quantity}</span>
                                                <button
                                                    className="crt__quantity-btn"
                                                    onClick={() => handleQuantityChange(item.product_id, 1)}
                                                >
                                                    <FaPlus />
                                                </button>
                                            </div>

                                            {/* Delete */}
                                            <button
                                                className="crt__delete-btn"
                                                onClick={() => handleDeleteClick(item.cart_id)}
                                                title="Remove item"
                                            >
                                                <FaTrash />
                                                <span>Remove</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Price */}
                                    <div className="crt__item-price">
                                        <span className="crt__price-total">${(Number(item.price) * item.quantity).toFixed(2)}</span>
                                        {item.quantity > 1 && (
                                            <span className="crt__price-unit">${Number(item.price).toFixed(2)} each</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Right: Order Summary ── */}
                {cartItems.length > 0 && (
                    <div className="crt__checkout-container">
                        <div className="crt__checkout-card">
                            <h3 className="crt__checkout-title">Order Summary</h3>

                            <div className="crt__checkout-details">
                                <div className="crt__checkout-row">
                                    <span>Items selected</span>
                                    <span className="crt__checkout-val">{selectedItems.length} / {cartItems.length}</span>
                                </div>
                                <div className="crt__checkout-row">
                                    <span>Subtotal</span>
                                    <span className="crt__checkout-val">${calculateSubtotal()}</span>
                                </div>
                                <div className="crt__checkout-row">
                                    <span>Shipping</span>
                                    <span className="crt__checkout-val crt__checkout-tbd">TBD</span>
                                </div>
                            </div>

                            <div className="crt__checkout-total">
                                <span>Estimated Total</span>
                                <span>${calculateSubtotal()}</span>
                            </div>

                            <button
                                className="crt__checkout-btn"
                                onClick={handleCheckoutClick}
                                disabled={selectedItems.length === 0 || isCheckingOut}
                            >
                                {isCheckingOut ? (
                                    <span className="crt__checkout-btn-content">
                                        <span className="crt__checkout-spinner" aria-hidden="true"></span>
                                        Checking stock…
                                    </span>
                                ) : (
                                    <span className="crt__checkout-btn-content">
                                        Proceed to Checkout
                                        <FaArrowRight />
                                    </span>
                                )}
                            </button>

                            {selectedItems.length === 0 && (
                                <p className="crt__checkout-hint">Select items above to continue</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Out-of-Stock Modal ── */}
            {outOfStockModal.open && (
                <div className="crt__modal-overlay" onClick={() => setOutOfStockModal({ open: false, items: [] })}>
                    <div className="crt__modal" onClick={(e) => e.stopPropagation()}>
                        <div className="crt__modal-header">
                            <FaExclamationTriangle className="crt__modal-icon" />
                            <h3>Some items are out of stock</h3>
                            <button
                                className="crt__modal-close"
                                onClick={() => setOutOfStockModal({ open: false, items: [] })}
                            >
                                <FaTimes />
                            </button>
                        </div>
                        <p className="crt__modal-desc">
                            The following items don't have enough stock to fulfill your order. Please update the quantities or remove them before proceeding.
                        </p>
                        <ul className="crt__modal-list">
                            {outOfStockModal.items.map((oos) => (
                                <li key={oos.product_id} className="crt__modal-item">
                                    <span className="crt__modal-item-name">{oos.title}</span>
                                    <span className="crt__modal-item-stock">
                                        Requested: <strong>{oos.requested_quantity}</strong> &nbsp;·&nbsp; Available: <strong>{oos.available_stock}</strong>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <button
                            className="crt__modal-btn"
                            onClick={() => setOutOfStockModal({ open: false, items: [] })}
                        >
                            Got it
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CartPage;