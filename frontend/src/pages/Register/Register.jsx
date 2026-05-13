import React, { useState, useContext, useEffect } from 'react';
import { toast } from 'react-toastify';
import { UserContext } from '../../context/UserProvider';
import { useNavigate, Link } from 'react-router-dom';
import 'react-toastify/dist/ReactToastify.css';
import './Register.css';
import LoginImg from '../../assets/images/logintem.png';
import { CreateNewUser } from '../../services/userService';

const Register = () => {
    const { user } = useContext(UserContext);
    const navigate = useNavigate();

    useEffect(() => {
        if (user && user.isAuthenticated) {
            navigate("/home");
        }
    }, [user, navigate]);

    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phoneNumber: ''
    });

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            toast.error("Passwords do not match!");
            return;
        }

        try {
            const response = await CreateNewUser({
                name: formData.fullName,
                email: formData.email,
                password: formData.password,
                phone: formData.phoneNumber
            });

            if (response && response.errCode === 0) {
                toast.success("Registration successful!");
                setTimeout(() => navigate('/login'), 500);
            } else {
                toast.error(response.error || "Registration failed!");
            }
        } catch (error) {
            toast.error("An error occurred during registration!");
            console.error(error);
        }
    };

    return (
        <div className="r-container">
            <div className="r-card">
                <div className="r-image-section">
                    <img src={LoginImg} alt="Register Background" className="r-image" />
                    <div className="r-overlay">
                        <div className="r-logo-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5c-1.1 0-2 .9-2 2v2"></path>
                                <circle cx="8.5" cy="7" r="4"></circle>
                                <line x1="20" y1="8" x2="20" y2="14"></line>
                                <line x1="23" y1="11" x2="17" y2="11"></line>
                            </svg>
                        </div>
                        <h2 className="r-welcome">Join Us!</h2>
                        <p className="r-motto">Create an account to build your dream PC and manage your orders seamlessly.</p>
                        
                        <div className="r-feature-list">
                            <div className="r-feature-item">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Track Your Orders</span>
                            </div>
                            <div className="r-feature-item">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Save Custom Builds</span>
                            </div>
                            <div className="r-feature-item">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Exclusive Member Deals</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="r-form-section">
                    <div className="r-form-container">
                        <div className="r-form-header">
                            <h1 className="r-title">Register</h1>
                            <p className="r-subtitle">Create a new account</p>
                        </div>

                        <form onSubmit={handleRegister} className="r-form">
                            <div className="r-input-group">
                                <div className="r-input-icon-left">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                </div>
                                <input 
                                    type="text" 
                                    name="fullName" 
                                    className="r-input" 
                                    placeholder="Full Name" 
                                    value={formData.fullName} 
                                    onChange={handleChange} 
                                    required 
                                />
                            </div>

                            <div className="r-input-group">
                                <div className="r-input-icon-left">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                </div>
                                <input 
                                    type="email" 
                                    name="email" 
                                    className="r-input" 
                                    placeholder="Email Address" 
                                    value={formData.email} 
                                    onChange={handleChange} 
                                    required 
                                />
                            </div>

                            <div className="r-input-group">
                                <div className="r-input-icon-left">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                </div>
                                <input 
                                    type="text" 
                                    name="phoneNumber" 
                                    className="r-input" 
                                    placeholder="Phone Number" 
                                    value={formData.phoneNumber} 
                                    onChange={handleChange} 
                                    required 
                                />
                            </div>

                            <div className="r-row">
                                <div className="r-input-group">
                                    <div className="r-input-icon-left">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                    </div>
                                    <input 
                                        type={showPassword ? "text" : "password"} 
                                        name="password" 
                                        className="r-input" 
                                        placeholder="Password" 
                                        value={formData.password} 
                                        onChange={handleChange} 
                                        required 
                                    />
                                    <div className="r-input-icon-right" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                        ) : (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                        )}
                                    </div>
                                </div>

                                <div className="r-input-group">
                                    <div className="r-input-icon-left">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                    </div>
                                    <input 
                                        type={showConfirmPassword ? "text" : "password"} 
                                        name="confirmPassword" 
                                        className="r-input" 
                                        placeholder="Confirm Password" 
                                        value={formData.confirmPassword} 
                                        onChange={handleChange} 
                                        required 
                                    />
                                    <div className="r-input-icon-right" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                        {showConfirmPassword ? (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                        ) : (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button type="submit" className="r-button">Create Account</button>

                            <div className="r-signup">
                                <p>Already have an account? <Link to="/Login" className="r-link">Sign In</Link></p>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;
