import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { addToCart } from '../../services/apiService';
import {
    sendChatbotQuery,
    getConversations,
    getConversationMessages,
    deleteConversation,
} from '../../services/chatbotService';
import { UserContext } from '../../context/UserProvider';
import './Chatbot.css';
import { FaShoppingCart, FaRobot, FaTimes, FaPaperPlane, FaChevronLeft, FaPlus, FaComments, FaTrash } from 'react-icons/fa';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const WELCOME_MSG = {
    text: 'Xin chào! Mình có thể hỗ trợ bạn tìm linh kiện, kiểm tra giá hoặc gợi ý build PC.',
    sender: 'bot',
};

const formatPrice = (value) => {
    if (value === null || value === undefined || value === '') return 'Liên hệ';
    const numericValue = Number(value) * 26000;
    if (Number.isNaN(numericValue)) return String(value);
    return `${new Intl.NumberFormat('vi-VN').format(numericValue)}đ`;
};

const getProductImage = (image) => {
    if (!image) return '/default-image.jpg';
    return String(image).split(';')[0].trim() || '/default-image.jpg';
};

const formatConvTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} giờ trước`;
    return d.toLocaleDateString('vi-VN');
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const Chatbot = () => {
    const [isOpen, setIsOpen] = useState(false);
    // 'chat' | 'list'  — which view is shown inside the window
    const [view, setView] = useState('chat');

    // Current conversation
    const [conversationId, setConversationId] = useState(null); // null = new (not saved yet)
    const [messages, setMessages] = useState([WELCOME_MSG]);

    // Conversation list
    const [conversations, setConversations] = useState([]);
    const [convLoading, setConvLoading] = useState(false);
    const [deleteConfirmConvId, setDeleteConfirmConvId] = useState(null);

    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const { user, fetchUser } = useContext(UserContext);
    const navigate = useNavigate();
    const userId = user?.account?.id || user?.account?.user_id || null;

    // ── Add to cart ──────────────────────────────────────────────────────────
    const handleAddToCart = async (e, product) => {
        e.stopPropagation(); // Ngăn không cho click trigger chuyển trang
        if (!(user && user.isAuthenticated)) {
            toast.error("You must be logged in to add products to the cart!");
            navigate('/login');
            return;
        }

        const isPriceNotAvailable = Number(product.price || 0) === 0;
        if (isPriceNotAvailable) {
            toast.error("Price is not available. Cannot add to cart.");
            return;
        }

        if (product.stock !== undefined && Number(product.stock) <= 0) {
            toast.error("This product is out of stock.");
            return;
        }

        try {
            const response = await addToCart(user.account.id, product.product_id, 1);
            if (response && response.errCode === 0) {
                toast.success("Item added to cart successfully!");
                if (fetchUser) fetchUser();
            } else {
                toast.error(response?.error || "Failed to add product to cart.");
            }
        } catch (error) {
            console.error("Error adding product to cart:", error);
            toast.error("An error occurred while adding the product to the cart.");
        }
    };

    // ── Auto-scroll ──────────────────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Focus input when chat opens ──────────────────────────────────────────
    useEffect(() => {
        if (isOpen && view === 'chat') {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen, view]);

    // ── Load conversation list ───────────────────────────────────────────────
    const loadConversations = useCallback(async () => {
        if (!userId) return;
        setConvLoading(true);
        try {
            const res = await getConversations(userId);
            if (res?.success) {
                setConversations(res.conversations || []);
            }
        } finally {
            setConvLoading(false);
        }
    }, [userId]);

    // Load conversation list whenever the list view is shown
    useEffect(() => {
        if (isOpen && view === 'list') {
            loadConversations();
        }
    }, [isOpen, view, loadConversations]);

    // ── Toggle chat window ───────────────────────────────────────────────────
    const toggleChat = () => {
        setIsOpen((prev) => !prev);
    };

    // ── Start a brand-new conversation ──────────────────────────────────────
    const startNewConversation = () => {
        setConversationId(null);
        setMessages([WELCOME_MSG]);
        setInput('');
        setView('chat');
    };

    // ── Load an existing conversation ────────────────────────────────────────
    const openConversation = async (conv) => {
        setView('chat');
        setConversationId(conv.id);
        setMessages([]);
        try {
            const res = await getConversationMessages(conv.id);
            if (res?.success && Array.isArray(res.messages)) {
                const mapped = res.messages.map((m) => ({
                    text: m.content,
                    sender: m.role === 'user' ? 'user' : 'bot',
                    products: Array.isArray(m.products) ? m.products : [],
                }));
                setMessages(mapped.length ? mapped : [WELCOME_MSG]);
            } else {
                setMessages([WELCOME_MSG]);
            }
        } catch {
            setMessages([WELCOME_MSG]);
        }
    };

    // ── Delete a conversation ────────────────────────────────────────────────
    const triggerDeleteConversation = (e, convId) => {
        e.stopPropagation();
        setDeleteConfirmConvId(convId);
    };

    const confirmDeleteConversation = async () => {
        if (!deleteConfirmConvId) return;
        const convId = deleteConfirmConvId;
        setDeleteConfirmConvId(null);
        
        try {
            const res = await deleteConversation(convId, userId);
            if (res?.success || res?.status === 200 || res?.data?.success) {
                toast.success("Đã xóa cuộc trò chuyện");
                setConversations((prev) => prev.filter(c => c.id !== convId));
                if (conversationId === convId) {
                    startNewConversation();
                    setView('list');
                }
            } else {
                toast.error("Không thể xóa cuộc trò chuyện");
            }
        } catch (error) {
            console.error("Error deleting conversation:", error);
            toast.error("Đã xảy ra lỗi khi xóa");
        }
    };

    const cancelDeleteConversation = () => {
        setDeleteConfirmConvId(null);
    };

    // ── Send message ─────────────────────────────────────────────────────────
    const handleSend = async () => {
        if (input.trim() === '') return;

        const userMessage = { text: input, sender: 'user' };
        setMessages((prev) => [...prev, userMessage]);
        const sentText = input;
        setInput('');
        setIsTyping(true);

        try {
            const response = await sendChatbotQuery(sentText, userId, conversationId);
            const chatbotResponse = response?.response ?? response;
            const output =
                chatbotResponse?.message ??
                chatbotResponse?.output ??
                chatbotResponse?.detail ??
                chatbotResponse?.error;
            const products = Array.isArray(chatbotResponse?.products)
                ? chatbotResponse.products
                : [];

            // If backend created / used a conversation, track its ID
            if (response?.conversation_id && !conversationId) {
                setConversationId(response.conversation_id);
            }

            setTimeout(() => {
                if (response?.success && output) {
                    setMessages((prev) => [...prev, { text: output, sender: 'bot', products }]);
                } else {
                    setMessages((prev) => [
                        ...prev,
                        {
                            text:
                                output ||
                                'Xin lỗi, mình chưa lấy được phản hồi từ chatbot. Vui lòng thử lại sau.',
                            sender: 'bot',
                        },
                    ]);
                }
                setIsTyping(false);
            }, 600);
        } catch (error) {
            console.error('Error in chatbot:', error);
            setMessages((prev) => [
                ...prev,
                { text: 'Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại.', sender: 'bot' },
            ]);
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="ts-chatbot-container">
            {/* Floating toggle button */}
            {!isOpen && (
                <button className="ts-chatbot-button" onClick={toggleChat} aria-label="Toggle chat">
                    <FaRobot />
                </button>
            )}

            {/* Chat window */}
            {isOpen && (
                <div className="ts-chatbot-window ts-chatbot-window-no-button">
                    {/* ── Header ── */}
                    <div className="ts-chatbot-header">
                        <div className="ts-chatbot-header-left">
                            {view === 'list' ? (
                                <button
                                    className="ts-icon-btn"
                                    onClick={() => setView('chat')}
                                    aria-label="Back to chat"
                                    title="Quay lại chat"
                                >
                                    <FaChevronLeft />
                                </button>
                            ) : (
                                <div className="ts-chatbot-header-avatar">
                                    <FaRobot />
                                </div>
                            )}
                            <div className="ts-chatbot-header-info">
                                <h3>
                                    {view === 'list'
                                        ? 'Lịch sử hội thoại'
                                        : 'TechShop AI Assistant'}
                                </h3>
                                {view === 'chat' && (
                                    <div className="ts-chatbot-header-status">
                                        <div className="ts-chatbot-header-status-dot" />
                                        <span>Active</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="ts-chatbot-header-actions">
                            {/* Show conversation-list button only when logged in and in chat view */}
                            {userId && view === 'chat' && (
                                <>
                                    <button
                                        className="ts-icon-btn"
                                        onClick={() => setView('list')}
                                        aria-label="Conversation list"
                                        title="Xem lịch sử hội thoại"
                                    >
                                        <FaComments />
                                    </button>
                                    <button
                                        className="ts-icon-btn"
                                        onClick={startNewConversation}
                                        aria-label="New conversation"
                                        title="Bắt đầu cuộc trò chuyện mới"
                                    >
                                        <FaPlus />
                                    </button>
                                </>
                            )}
                            {userId && view === 'list' && (
                                <button
                                    className="ts-icon-btn"
                                    onClick={startNewConversation}
                                    aria-label="New conversation"
                                    title="Bắt đầu cuộc trò chuyện mới"
                                >
                                    <FaPlus />
                                </button>
                            )}
                            <button
                                    className="ts-close-button"
                                    onClick={toggleChat}
                                    aria-label="Close chat"
                                >
                                    <FaTimes />
                                </button>
                        </div>
                    </div>

                    {/* ── Delete Confirmation Modal ── */}
                    {deleteConfirmConvId && (
                        <div className="ts-chatbot-modal-overlay">
                            <div className="ts-chatbot-modal">
                                <h4>Xác nhận xóa</h4>
                                <p>Bạn có chắc chắn muốn xóa cuộc trò chuyện này không?</p>
                                <div className="ts-chatbot-modal-actions">
                                    <button className="btn-cancel" onClick={cancelDeleteConversation}>Hủy</button>
                                    <button className="btn-confirm" onClick={confirmDeleteConversation}>Xóa</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Conversation List View ── */}
                    {view === 'list' && (
                        <div className="ts-conv-list">
                            {convLoading && (
                                <div className="ts-conv-loading">Đang tải...</div>
                            )}
                            {!convLoading && conversations.length === 0 && (
                                <div className="ts-conv-empty">
                                    <FaComments className="ts-conv-empty-icon" />
                                    <p>Chưa có cuộc hội thoại nào.</p>
                                    <button
                                        className="ts-conv-new-btn"
                                        onClick={startNewConversation}
                                    >
                                        Bắt đầu ngay
                                    </button>
                                </div>
                            )}
                            {!convLoading &&
                                conversations.map((conv) => (
                                    <button
                                        key={conv.id}
                                        className={`ts-conv-item ${conversationId === conv.id ? 'active' : ''}`}
                                        onClick={() => openConversation(conv)}
                                    >
                                        <div className="ts-conv-item-icon">
                                            <FaComments />
                                        </div>
                                        <div className="ts-conv-item-info">
                                            <div className="ts-conv-item-preview">
                                                {conv.first_message
                                                    ? conv.first_message.slice(0, 55) +
                                                    (conv.first_message.length > 55 ? '…' : '')
                                                    : 'Cuộc trò chuyện mới'}
                                            </div>
                                            <div className="ts-conv-item-time">
                                                {formatConvTime(conv.created_at)}
                                            </div>
                                        </div>
                                        <button 
                                            className="ts-conv-delete-btn"
                                            onClick={(e) => triggerDeleteConversation(e, conv.id)}
                                            title="Xóa cuộc trò chuyện"
                                        >
                                            <FaTrash />
                                        </button>
                                    </button>
                                ))}
                        </div>
                    )}

                    {/* ── Chat View ── */}
                    {view === 'chat' && (
                        <>
                            <div className="ts-chatbot-messages">
                                {messages.map((msg, index) => (
                                    <div key={index} className={`ts-message ${msg.sender}`}>
                                        <div className="ts-message-row">
                                            <div className="ts-message-text">
                                                <div className="ts-markdown-wrapper">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm]}
                                                        components={{
                                                            a: ({ href, children, ...props }) => {
                                                                const isInternal =
                                                                    typeof href === 'string' &&
                                                                    href.startsWith('/');
                                                                return (
                                                                    <a
                                                                        href={href}
                                                                        {...props}
                                                                        target={
                                                                            isInternal
                                                                                ? undefined
                                                                                : '_blank'
                                                                        }
                                                                        rel={
                                                                            isInternal
                                                                                ? undefined
                                                                                : 'noreferrer'
                                                                        }
                                                                    >
                                                                        {children}
                                                                    </a>
                                                                );
                                                            },
                                                            img: ({ src, alt, ...props }) => (
                                                                <img
                                                                    src={src}
                                                                    alt={alt || 'product'}
                                                                    {...props}
                                                                />
                                                            ),
                                                        }}
                                                    >
                                                        {msg.text}
                                                    </ReactMarkdown>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Product cards */}
                                        {msg.sender === 'bot' &&
                                            Array.isArray(msg.products) &&
                                            msg.products.length > 0 && (
                                                <div className="ts-chatbot-product-grid">
                                                    {msg.products.map((product) => (
                                                        <button
                                                            key={product.product_id}
                                                            type="button"
                                                            className="ts-chatbot-product-card"
                                                            onClick={() =>
                                                                navigate(
                                                                    `/product-info/${product.product_id}`
                                                                )
                                                            }
                                                        >
                                                            <div className="ts-chatbot-product-image-wrap">
                                                                <img
                                                                    src={getProductImage(
                                                                        product.image
                                                                    )}
                                                                    alt={
                                                                        product.title || 'Product'
                                                                    }
                                                                    className="ts-chatbot-product-image"
                                                                />
                                                            </div>
                                                            <div className="ts-chatbot-product-info">
                                                                {product.category_name && (
                                                                    <span className="ts-chatbot-product-category">
                                                                        {product.category_name}
                                                                    </span>
                                                                )}
                                                                <div className="ts-chatbot-product-title">
                                                                    {product.title || 'Sản phẩm'}
                                                                </div>
                                                                <span className="ts-chatbot-product-price">
                                                                    {formatPrice(product.price)}
                                                                </span>
                                                                <button
                                                                    className="ts-chatbot-add-to-cart-btn"
                                                                    onClick={(e) => handleAddToCart(e, product)}
                                                                >
                                                                    <FaShoppingCart /> Add to Cart
                                                                </button>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                    </div>
                                ))}

                                {isTyping && (
                                    <div className="ts-message bot">
                                        <div className="ts-typing-indicator">
                                            <span></span>
                                            <span></span>
                                            <span></span>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="ts-chatbot-input">
                                <input
                                    type="text"
                                    placeholder="Hỏi về linh kiện, giá hoặc build PC..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    ref={inputRef}
                                />
                                <button onClick={handleSend} disabled={isTyping}>
                                    <FaPaperPlane />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default Chatbot;