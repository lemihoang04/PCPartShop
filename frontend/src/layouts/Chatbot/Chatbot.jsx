import React, { useState, useRef, useEffect, useContext } from 'react';
import ReactMarkdown from 'react-markdown'; // Import thêm react-markdown
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { sendChatbotQuery } from '../../services/chatbotService';
import { UserContext } from '../../context/UserProvider';
import './Chatbot.css';
import { FaRobot, FaTimes, FaUser, FaPaperPlane } from 'react-icons/fa';

const Chatbot = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { text: 'Xin chào! Mình có thể hỗ trợ bạn tìm linh kiện, kiểm tra giá hoặc gợi ý build PC.', sender: 'bot' }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const { user } = useContext(UserContext);
    const navigate = useNavigate();
    const userId = user?.account?.id || user?.account?.user_id || null;

    const formatPrice = (value) => {
        if (value === null || value === undefined || value === '') {
            return 'Liên hệ';
        }

        const numericValue = Number(value);
        if (Number.isNaN(numericValue)) {
            return String(value);
        }

        return `${new Intl.NumberFormat('vi-VN').format(numericValue)}đ`;
    };

    const getProductImage = (image) => {
        if (!image) {
            return '/default-image.jpg';
        }

        return String(image).split(';')[0].trim() || '/default-image.jpg';
    };

    const toggleChat = () => {
        setIsOpen(!isOpen);
        // Add focus to input when chat opens and scroll to bottom
        if (!isOpen) {
            setTimeout(() => {
                inputRef.current?.focus();
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 300);
        }
    };

    const handleSend = async () => {
        if (input.trim() === '') return;

        // Add user message
        const userMessage = { text: input, sender: 'user' };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsTyping(true);

        try {
            const response = await sendChatbotQuery(input, userId);
            const chatbotResponse = response?.response ?? response;
            const output = chatbotResponse?.message ?? chatbotResponse?.output ?? chatbotResponse?.detail ?? chatbotResponse?.error;
            const products = Array.isArray(chatbotResponse?.products) ? chatbotResponse.products : [];

            setTimeout(() => {
                if (response?.success && output) {
                    setMessages(prev => [...prev, { text: output, sender: 'bot', products }]);
                } else {
                    setMessages(prev => [...prev, {
                        text: output || 'Xin lỗi, mình chưa lấy được phản hồi từ chatbot. Vui lòng thử lại sau.',
                        sender: 'bot'
                    }]);
                }
                setIsTyping(false);
            }, 600);
        } catch (error) {
            console.error('Error in chatbot:', error);
            setMessages(prev => [...prev, {
                text: 'Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại.',
                sender: 'bot'
            }]);
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Load messages from sessionStorage on component mount
    useEffect(() => {
        const savedMessages = sessionStorage.getItem('chatMessages');
        if (savedMessages) {
            setMessages(JSON.parse(savedMessages));
            // Add a small delay then scroll to bottom when messages are loaded
            if (isOpen) {
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
                }, 100);
            }
        }
    }, [isOpen]);

    // Save messages to sessionStorage whenever they change
    useEffect(() => {
        sessionStorage.setItem('chatMessages', JSON.stringify(messages));
    }, [messages]);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="ts-chatbot-container">
            {/* Chat button - only shown when chat is closed */}
            {!isOpen && (
                <button
                    className="ts-chatbot-button"
                    onClick={toggleChat}
                    aria-label="Toggle chat"
                >
                    <FaRobot />
                </button>
            )}

            {/* Chat window */}
            {isOpen && (
                <div className="ts-chatbot-window ts-chatbot-window-no-button">
                    <div className="ts-chatbot-header">
                        <div className="ts-chatbot-header-left">
                            <div className="ts-chatbot-header-avatar">
                                <FaRobot />
                            </div>
                            <div className="ts-chatbot-header-info">
                                <h3>TechShop AI Assistant</h3>
                                <div className="ts-chatbot-header-status">
                                    <div className="ts-chatbot-header-status-dot" />
                                    <span>Đang hoạt động</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={toggleChat} className="ts-close-button" aria-label="Close chat">
                            <FaTimes />
                        </button>
                    </div>

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
                                                        const isInternal = typeof href === 'string' && href.startsWith('/');
                                                        return (
                                                            <a
                                                                href={href}
                                                                {...props}
                                                                target={isInternal ? undefined : '_blank'}
                                                                rel={isInternal ? undefined : 'noreferrer'}
                                                            >
                                                                {children}
                                                            </a>
                                                        );
                                                    },
                                                    img: ({ src, alt, ...props }) => (
                                                        <img src={src} alt={alt || 'product'} {...props} />
                                                    )
                                                }}
                                            >
                                                {msg.text}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                                {msg.sender === 'bot' && Array.isArray(msg.products) && msg.products.length > 0 && (
                                    <div className="ts-chatbot-product-grid">
                                        {msg.products.map((product) => (
                                            <button
                                                key={product.product_id}
                                                type="button"
                                                className="ts-chatbot-product-card"
                                                onClick={() => navigate(`/product-info/${product.product_id}`)}
                                            >
                                                <div className="ts-chatbot-product-image-wrap">
                                                    <img
                                                        src={getProductImage(product.image)}
                                                        alt={product.title || 'Product'}
                                                        className="ts-chatbot-product-image"
                                                    />
                                                </div>
                                                <div className="ts-chatbot-product-info">
                                                    {product.category_name && (
                                                        <span className="ts-chatbot-product-category">{product.category_name}</span>
                                                    )}
                                                    <div className="ts-chatbot-product-title">
                                                        {product.title || 'Sản phẩm'}
                                                    </div>
                                                    <span className="ts-chatbot-product-price">{formatPrice(product.price)}</span>
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
                </div>
            )}
        </div>
    );
};

export default Chatbot;