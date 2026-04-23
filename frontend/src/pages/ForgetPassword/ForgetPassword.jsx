import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './ForgetPassword.css';
import OTPVerifyModal from './OTPVerifyModal';
import { forgotPassword, verifyOTP, resetPassword } from '../../services/userService';
import { toast } from 'react-toastify';

const ForgetPassword = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showOTPModal, setShowOTPModal] = useState(false);
    const [otpVerified, setOtpVerified] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [verifiedOTP, setVerifiedOTP] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isLoading) return;
        if (!email) {
            setError('Please enter your email');
            toast.error('Please enter your email');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const response = await forgotPassword(email);
            setIsLoading(false);
            if (response && response.errCode === 0) {
                setShowOTPModal(true);
                toast.success('OTP code has been sent to your email');
            } else {
                const errorMessage = response.message || 'Email not found. Please check your email address.';
                setError(errorMessage);
                toast.error(errorMessage);
            }
        } catch (error) {
            setIsLoading(false);
            const errorMessage = 'An error occurred. Please try again later.';
            setError(errorMessage);
            toast.error(errorMessage);
        }
    };

    const handleVerifyOTP = async (otpValue) => {
        try {
            const response = await verifyOTP(email, otpValue);
            if (response.errCode === 0) {
                setOtpVerified(true);
                setVerifiedOTP(otpValue);
                setShowOTPModal(false);
                toast.success('OTP verified successfully');
            } else {
                const errorMessage = response.message || 'Invalid OTP. Please try again.';
                toast.error(errorMessage);
            }
        } catch (error) {
            const errorMessage = error.message || 'Failed to verify OTP. Please try again.';
            toast.error(errorMessage);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!newPassword) {
            setError('Please enter your new password');
            toast.error('Please enter your new password');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            toast.error('Passwords do not match');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const response = await resetPassword(email, verifiedOTP, newPassword);
            setIsLoading(false);
            if (response.errCode === 0) {
                setIsSubmitted(true);
                toast.success('Password reset successful!');
            } else {
                const errorMessage = response.message || 'Failed to reset password. Please try again.';
                setError(errorMessage);
                toast.error(errorMessage);
            }
        } catch (error) {
            setIsLoading(false);
            const errorMessage = error.message || 'An error occurred. Please try again later.';
            setError(errorMessage);
            toast.error(errorMessage);
        }
    };

    const closeOTPModal = () => {
        setShowOTPModal(false);
    };

    return (
        <div className="forget-password__container">
            <div className="forget-password__card">
                <div className="forget-password__header">
                    <h1 className="forget-password__title">Forgot Password</h1>
                    {!isSubmitted && !otpVerified && (
                        <p className="forget-password__subtitle">
                            Enter your registered email to receive password reset instructions
                        </p>
                    )}
                    {!isSubmitted && otpVerified && (
                        <p className="forget-password__subtitle">
                            Create a new password for your account
                        </p>
                    )}
                </div>
                {!isSubmitted ? (
                    !otpVerified ? (
                        <form className="forget-password__form" onSubmit={handleSubmit}>
                            <div className="forget-password__form-group">
                                <label htmlFor="email" className="forget-password__label">Email</label>
                                <input
                                    type="email"
                                    id="email"
                                    className="forget-password__input"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email address"
                                />
                                {error && <p className="forget-password__error">{error}</p>}
                            </div>
                            <button
                                type="submit"
                                className={`forget-password__button ${isLoading ? 'forget-password__button--loading' : ''}`}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <span className="forget-password__spinner"></span>
                                        Processing...
                                    </>
                                ) : (
                                    'Send Request'
                                )}
                            </button>
                            <div className="forget-password__links">
                                <Link to="/login" className="forget-password__back-link">
                                    Back to Login
                                </Link>
                            </div>
                        </form>
                    ) : (
                        <form className="forget-password__form" onSubmit={handleResetPassword}>
                            <div className="forget-password__form-group">
                                <label htmlFor="newPassword" className="forget-password__label">New Password</label>
                                <input
                                    type="password"
                                    id="newPassword"
                                    className="forget-password__input"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Enter your new password"
                                />
                            </div>
                            <div className="forget-password__form-group">
                                <label htmlFor="confirmPassword" className="forget-password__label">Confirm Password</label>
                                <input
                                    type="password"
                                    id="confirmPassword"
                                    className="forget-password__input"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm your new password"
                                />
                                {error && <p className="forget-password__error">{error}</p>}
                            </div>
                            <button
                                type="submit"
                                className={`forget-password__button ${isLoading ? 'forget-password__button--loading' : ''}`}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <span className="forget-password__spinner"></span>
                                        Processing...
                                    </>
                                ) : (
                                    'Reset Password'
                                )}
                            </button>
                        </form>
                    )
                ) : (
                    <div className="forget-password__success">
                        <div className="forget-password__success-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        </div>
                        <h2 className="forget-password__success-title">Password Reset Successful!</h2>
                        <p className="forget-password__success-message">
                            Your password has been reset successfully. You can now login with your new password.
                        </p>
                        <Link to="/login" className="forget-password__back-button">
                            Back to Login
                        </Link>
                    </div>
                )}
            </div>
            <OTPVerifyModal
                isOpen={showOTPModal}
                onClose={closeOTPModal}
                email={email}
                onVerify={handleVerifyOTP}
            />
        </div>
    );
};

export default ForgetPassword;