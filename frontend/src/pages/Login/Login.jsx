import React, { useState, useContext, useEffect } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate, Link } from 'react-router-dom';
import { LoginUser } from '../../services/userService';
import { UserContext } from '../../context/UserProvider';
import './Login.css';
import LoginImg from '../../assets/images/logintem.png';

const Login = () => {
    const { user, loginUser } = useContext(UserContext);
    const navigate = useNavigate();
    useEffect(() => {
        if (user && user.isAuthenticated) {
            navigate("/home");
        }
    }, [user, navigate]);

    const [formValues, setFormValues] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    
    const handleChange = (e) => {
        setFormValues({ ...formValues, [e.target.name]: e.target.value });
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!formValues.email || !formValues.password) {
            toast.error('Please enter both email and password');
            return;
        }

        try {
            const response = await LoginUser(formValues);
            if (response && response.errCode === 0) {
                toast.success('Login successful!');

                let data = {
                    isAuthenticated: true,
                    account: response.user,
                    isLoading: false,
                };
                loginUser(data);

                setTimeout(() => {
                    navigate("/");
                }, 500);
            } else {
                toast.error(response.error);
                setFormValues({ ...formValues, password: '' });
            }
        } catch (err) {
            toast.error('Invalid email or password');
            setFormValues({ ...formValues, password: '' });
        }
    };

    return (
        <div className="l-container">
            <div className="l-card">
                <div className="l-image-section">
                    <img src={LoginImg} alt="Login" className="l-image" />
                    <div className="l-overlay">
                        <div className="l-logo-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                <line x1="12" y1="22.08" x2="12" y2="12"></line>
                            </svg>
                        </div>
                        <h2 className="l-welcome">Welcome Back</h2>
                        <p className="l-motto">Enter your credentials to access your account and continue your journey.</p>
                        
                        <div className="l-feature-list">
                            <div className="l-feature-item">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Fast & Secure Access</span>
                            </div>
                            <div className="l-feature-item">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Manage Your Orders</span>
                            </div>
                            <div className="l-feature-item">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Build Custom PCs</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="l-form-section">
                    <div className="l-form-container">
                        <div className="l-form-header">
                            <h1 className="l-title">Sign In</h1>
                            <p className="l-subtitle">Please login to access your account</p>
                        </div>

                        <form onSubmit={handleLogin} className="l-form">
                            <div className="l-input-group">
                                <div className="l-input-icon-left">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                </div>
                                <input
                                    type="text"
                                    name="email"
                                    className="l-input"
                                    placeholder="Email or Username"
                                    value={formValues.email}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="l-input-group">
                                <div className="l-input-icon-left">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    className="l-input"
                                    placeholder="Password"
                                    value={formValues.password}
                                    onChange={handleChange}
                                />
                                <div className="l-input-icon-right" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    )}
                                </div>
                            </div>

                            <div className="l-options">
                                <div className="l-checkbox-group">
                                    <input
                                        type="checkbox"
                                        id="rememberMe"
                                        className="l-checkbox"
                                    />
                                    <label className="l-checkbox-label" htmlFor="rememberMe">Remember me</label>
                                </div>
                                <Link to="/forgot-password" className="l-forgot">Forgot password?</Link>
                            </div>

                            <button type="submit" className="l-button">Sign In</button>

                            <div className="l-signup">
                                <p>Don't have an account? <Link to="/Register" className="l-link">Create Account</Link></p>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
