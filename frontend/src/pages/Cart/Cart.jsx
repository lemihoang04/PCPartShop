import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { UserContext } from "../../context/UserProvider";
import { toast } from 'react-toastify';
import { loadCart, removeFromCart, checkOutStock } from '../../services/apiService';
import './Cart.css'; // Đổi tên file CSS

const CartPage = () => {
    const navigate = useNavigate();
    const [cartItems, setCartItems] = useState([]);
    const { user, fetchUser } = useContext(UserContext);
    const [selectedItems, setSelectedItems] = useState([]);
    const [isCheckingOut, setIsCheckingOut] = useState(false);

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
            prev.includes(id)
                ? prev.filter((itemId) => itemId !== id)
                : [...prev, id]
        );
    };

    const handleCheckoutClick = async () => {
        if (selectedItems.length === 0) {
            toast.error("Please select at least one item to proceed to checkout.");
            return;
        }

        if (isCheckingOut) {
            return;
        }

        setIsCheckingOut(true);

        const formValue = {
            items: cartItems.filter(item => selectedItems.includes(item.cart_id)),
            amount: calculateSubtotal(),
        };

        try {
            const checkOutStockRes = await checkOutStock(formValue.items);
            if (checkOutStockRes.data && checkOutStockRes.errCode === 0) {
                setTimeout(() => {
                    navigate("/checkout", {
                        state: { formValue }
                    });
                }, 1000);
            } else {
                toast.error("Stock check failed. Please review your cart items.");
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
                setCartItems((prevCartItems) =>
                    prevCartItems.filter((item) => item.cart_id !== cart_id)
                );

                // Keep selected items in sync with removed cart entry.
                setSelectedItems((prev) => prev.filter((id) => id !== cart_id));

                toast.success("Item removed from the cart.");
                fetchUser();
            } else {
                toast.error("Failed to delete items.");
            }
        } catch (error) {
            console.error('Error deleting item:', error);
            toast.error("Failed to delete items.");
        }
    };

    const handleSelectToggle = () => {
        if (selectedItems.length === cartItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(cartItems.map((item) => item.cart_id));
        }
    };

    // Calculate subtotal dynamically
    const calculateSubtotal = () => {
        return cartItems
            .filter((item) => selectedItems.includes(item.cart_id))
            .reduce((total, item) => total + item.price * item.quantity, 0)
            .toFixed(2);
    };

    // Handle quantity change
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

    return (
        <div className="crt__container">
            <div className="crt__content">
                {/* Cart Items (Left Side) */}
                <div className="crt__items-container">
                    <h2 className="crt__title">Shopping Cart</h2>

                    <div className="crt__select-all">
                        <button
                            className="crt__select-all-btn"
                            onClick={handleSelectToggle}
                        >
                            {selectedItems.length === cartItems.length ? "Deselect all items" : "Select all items"}
                        </button>
                    </div>

                    {cartItems.length === 0 ? (
                        <div className="crt__empty">
                            <h3>Your cart is empty</h3>
                            <p>Browse our products and add something you like!</p>
                        </div>
                    ) : (
                        <div className="crt__items-list">
                            {cartItems.map((item) => (
                                <div key={item.cart_id} className="crt__item">
                                    <div className="crt__item-checkbox">
                                        <input
                                            type="checkbox"
                                            className="crt__checkbox"
                                            checked={selectedItems.includes(item.cart_id)}
                                            onChange={() => handleCheckboxChange(item.cart_id)}
                                        />
                                    </div>
                                    <div className="crt__item-image">
                                        <img
                                            src={item.image ? item.image.split("; ")[0] : "default-image.jpg"}
                                            alt={item.title}
                                        />
                                    </div>
                                    <div className="crt__item-details">
                                        <h3
                                            className="crt__item-name"
                                            onClick={() => navigate(`/product-info/${item.product_id}`)}>{item.title}</h3>
                                        <div className="crt__item-actions">
                                            <div className="crt__quantity-control">
                                                <button
                                                    className="crt__quantity-btn crt__quantity-decrease"
                                                    onClick={() => handleQuantityChange(item.product_id, -1)}
                                                >
                                                    -
                                                </button>
                                                <span className="crt__quantity-value">{item.quantity}</span>
                                                <button
                                                    className="crt__quantity-btn crt__quantity-increase"
                                                    onClick={() => handleQuantityChange(item.product_id, 1)}
                                                >
                                                    +
                                                </button>
                                            </div>
                                            <div className="crt__item-links">
                                                <button onClick={() => handleDeleteClick(item.cart_id)} className="crt__action-btn crt__delete-btn">Delete</button>
                                                <button className="crt__action-btn">Compare</button>
                                                <button className="crt__action-btn">Share</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="crt__item-price">
                                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {cartItems.length > 0 && (
                        <div className="crt__subtotal-mobile">
                            <h3>
                                {selectedItems.length !== 0 ? `Subtotal (${selectedItems.length} items): $${calculateSubtotal()}` : "No items selected"}
                            </h3>
                        </div>
                    )}
                </div>

                {/* Checkout Section (Right Side) */}
                {cartItems.length > 0 && (
                    <div className="crt__checkout-container">
                        <div className="crt__checkout-card">
                            <h3 className="crt__checkout-title">Order Summary</h3>
                            <div className="crt__checkout-details">
                                <div className="crt__checkout-row">
                                    <span>Items ({selectedItems.length}):</span>
                                    <span>${calculateSubtotal()}</span>
                                </div>
                                <div className="crt__checkout-row">
                                    <span>Shipping:</span>
                                    <span>TBD</span>
                                </div>
                                <div className="crt__checkout-total">
                                    <span>Total:</span>
                                    <span>${calculateSubtotal()}</span>
                                </div>
                            </div>
                            <button
                                className="crt__checkout-btn"
                                onClick={handleCheckoutClick}
                                disabled={selectedItems.length === 0 || isCheckingOut}
                            >
                                {isCheckingOut ? (
                                    <span className="crt__checkout-btn-content">
                                        <span className="crt__checkout-spinner" aria-hidden="true"></span>
                                        Checking stock...
                                    </span>
                                ) : (
                                    "Proceed to checkout"
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CartPage;