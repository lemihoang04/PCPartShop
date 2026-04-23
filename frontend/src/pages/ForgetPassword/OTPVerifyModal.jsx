import React, { useState, useEffect, useRef } from 'react';
import './OTPVerifyModal.css';
import { toast } from 'react-toastify';

const OTPVerifyModal = ({ isOpen, onClose, email, onVerify }) => {
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [timer, setTimer] = useState(60);
    const inputRefs = useRef([]);

    // Focus on first input when modal opens
    useEffect(() => {
        if (isOpen && inputRefs.current[0]) {
            inputRefs.current[0].focus();
        }
    }, [isOpen]);

    // Countdown timer for resend button
    useEffect(() => {
        let interval;
        if (isOpen && timer > 0) {
            interval = setInterval(() => {
                setTimer((prevTimer) => prevTimer - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isOpen, timer]);

    // Handle OTP input change
    const handleChange = (e, index) => {
        const value = e.target.value;

        // Only accept numbers
        if (value && !/^\d+$/.test(value)) {
            return;
        }

        // Update the OTP array
        const newOtp = [...otp];
        newOtp[index] = value.slice(0, 1); // Only take the first character
        setOtp(newOtp);
        setError('');

        // Auto focus to next input if value is entered
        if (value && index < 5) {
            inputRefs.current[index + 1].focus();
        }
    };

    // Handle key press for backspace and navigation
    const handleKeyDown = (e, index) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            // If current input is empty and backspace is pressed, focus on previous input
            inputRefs.current[index - 1].focus();
        } else if (e.key === 'ArrowLeft' && index > 0) {
            // Left arrow key focuses on previous input
            inputRefs.current[index - 1].focus();
        } else if (e.key === 'ArrowRight' && index < 5) {
            // Right arrow key focuses on next input
            inputRefs.current[index + 1].focus();
        }
    };

    // Handle paste event for OTP
    const handlePaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text');

        // Only accept digits
        const digits = pastedData.replace(/\D/g, '').slice(0, 6).split('');

        // Fill the OTP array with pasted digits
        const newOtp = [...otp];
        digits.forEach((digit, index) => {
            if (index < 6) {
                newOtp[index] = digit;
            }
        });

        setOtp(newOtp);

        // Focus on the next empty input or the last one
        const nextEmptyIndex = newOtp.findIndex(val => val === '');
        if (nextEmptyIndex !== -1) {
            inputRefs.current[nextEmptyIndex].focus();
        } else if (digits.length > 0) {
            inputRefs.current[Math.min(5, digits.length - 1)].focus();
        }

        if (digits.length === 6) {
            toast.info('OTP code pasted');
        }
    };

    // Handle resend OTP
    const handleResend = () => {
        setTimer(60);
        // Implement resend OTP API call here
        toast.info('New OTP code has been sent to your email');
        setError('');
        setOtp(['', '', '', '', '', '']);
        if (inputRefs.current[0]) {
            inputRefs.current[0].focus();
        }
    };

    // Handle verify OTP
    const handleVerify = () => {
        // Check if OTP is complete
        if (otp.some(digit => digit === '')) {
            setError('Please enter the complete 6-digit OTP');
            toast.error('Please enter the complete 6-digit OTP');
            return;
        }

        setIsLoading(true);

        // Call the API to verify OTP
        onVerify(otp.join(''))
            .then(() => {
                setIsLoading(false);
            })
            .catch((error) => {
                setIsLoading(false);
                setError(error.message || 'Failed to verify OTP');
            });
    };

    if (!isOpen) return null;

    return (
        <div className="otp-modal__overlay">
            <div className="otp-modal__container">
                <button className="otp-modal__close-button" onClick={onClose}>×</button>

                <div className="otp-modal__header">
                    <h2 className="otp-modal__title">Verify Your Email</h2>
                    <p className="otp-modal__subtitle">
                        We've sent a 6-digit verification code to
                        <span className="otp-modal__email">{email}</span>
                    </p>
                </div>

                <div className="otp-modal__content">
                    <div className="otp-modal__input-group">
                        {otp.map((digit, index) => (
                            <input
                                key={index}
                                ref={(el) => (inputRefs.current[index] = el)}
                                type="text"
                                className="otp-modal__input"
                                value={digit}
                                onChange={(e) => handleChange(e, index)}
                                onKeyDown={(e) => handleKeyDown(e, index)}
                                onPaste={index === 0 ? handlePaste : null}
                                maxLength={1}
                                autoComplete="off"
                            />
                        ))}
                    </div>

                    {error && <p className="otp-modal__error">{error}</p>}

                    <div className="otp-modal__action-row">
                        <button
                            className="otp-modal__resend-button"
                            disabled={timer > 0}
                            onClick={handleResend}
                        >
                            {timer > 0 ? `Resend in ${timer}s` : 'Resend Code'}
                        </button>
                    </div>

                    <button
                        className={`otp-modal__verify-button ${isLoading ? 'otp-modal__verify-button--loading' : ''}`}
                        onClick={handleVerify}
                        disabled={isLoading || otp.some(digit => digit === '')}
                    >
                        {isLoading ? (
                            <>
                                <span className="otp-modal__spinner"></span>
                                Verifying...
                            </>
                        ) : (
                            'Verify & Continue'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OTPVerifyModal;