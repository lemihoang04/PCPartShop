import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from "../../context/UserProvider";
import { LogOutUser } from "../../services/userService";
import { toast } from "react-toastify";
import './Header.css';

const Header = () => {
  const { user, logoutUser } = useContext(UserContext);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const productsRef = useRef(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.account) {
      setCartCount(user.account.cart_items_count || 0);
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        productsRef.current &&
        !productsRef.current.contains(event.target) &&
        !event.target.closest('.mega-panel')
      ) {
        setIsProductsOpen(false);
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !event.target.closest('.user-menu')
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleProducts = () => {
    setIsProductsOpen(!isProductsOpen);
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const closeAllMenus = () => {
    setIsProductsOpen(false);
    setIsDropdownOpen(false);
    setIsMobileNavOpen(false);
  };

  const handleLogout = async () => {
    try {
      let data = await LogOutUser();
      logoutUser();
      if (data && data.errCode === 0) {
        navigate("/");
        toast.success("Log out success");
      } else {
        toast.error("Log out failed");
      }
      closeAllMenus();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const accountName = user?.account?.name || 'User';
  const lastName = accountName.split(' ').filter(Boolean).slice(-1)[0] || 'User';
  const avatarChar = lastName.charAt(0).toUpperCase();

  const goTo = (path) => {
    navigate(path);
    setIsMobileNavOpen(false);
  };

  return (
    <div className="header-container dark-theme">
      <div className="main-header">
        <div className="brand-block" onClick={() => goTo('/home')}>
          <span className="brand-mark">TS</span>
          <div className="brand-text-wrap">
            <span className="brand-title">TechShop</span>
            <span className="brand-subtitle">Gaming and Creator Gear</span>
          </div>
        </div>

        <button
          className={`mobile-toggle ${isMobileNavOpen ? 'active' : ''}`}
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div className={`nav-container ${isMobileNavOpen ? 'show' : ''}`}>
          <div className="nav-item" onClick={() => goTo('/home')}>
            <i className="nav-icon fas fa-house"></i>
            <span>Home</span>
          </div>
          <div className="nav-item" onClick={() => goTo('/build')}>
            <i className="nav-icon fas fa-wand-magic-sparkles"></i>
            <span>PC Builder</span>
          </div>
          <div
            className={`nav-item ${isProductsOpen ? 'active' : ''}`}
            onClick={toggleProducts}
            ref={productsRef}
          >
            <i className="nav-icon fas fa-microchip"></i>
            <span>Components</span>
            <i className={`nav-arrow fas fa-chevron-${isProductsOpen ? 'up' : 'down'}`}></i>
          </div>
          <div className="nav-item" onClick={() => goTo('/laptops')}>
            <i className="nav-icon fas fa-laptop"></i>
            <span>Laptops</span>
          </div>
          <div className="nav-item" onClick={() => goTo('/shared-builds')}>
            <i className="nav-icon fas fa-share-alt"></i>
            <span>Shared Builds</span>
          </div>
          {/* <div className="nav-item" onClick={() => goTo('/home')}>
            <i className="nav-icon fas fa-headset"></i>
            <span>Support</span>
          </div> */}
        </div>

        <div className="user-actions">
          {user && user.isAuthenticated ? (
            <>
              <div className="action-item cart-icon" onClick={() => goTo('/cart')}>
                <i className="fas fa-shopping-cart"></i>
                <span className="cart-badge">{cartCount}</span>
              </div>
              <div
                className="action-item user-dropdown"
                onClick={toggleDropdown}
                ref={dropdownRef}
              >
                <div className="user-avatar">
                  <span>{avatarChar}</span>
                </div>
                <span className="user-name">Hi, {lastName}</span>
                <i className={`dropdown-arrow fas fa-chevron-${isDropdownOpen ? 'up' : 'down'}`}></i>

                <div className={`user-menu ${isDropdownOpen ? 'show' : ''}`}>
                  <div className="menu-header">
                    <span className="welcome-text">Welcome,</span>
                    <span className="user-fullname">{accountName}</span>
                  </div>
                  <div className="menu-items">
                    <div className="menu-item" onClick={() => goTo('/profile')}>
                      <i className="fas fa-user"></i>
                      <span>My Account</span>
                    </div>
                    <div className="menu-item" onClick={() => goTo('/orders')}>
                      <i className="fas fa-box"></i>
                      <span>My Orders</span>
                    </div>
                    <div className="menu-divider"></div>
                    <div className="menu-item logout" onClick={handleLogout}>
                      <i className="fas fa-sign-out-alt"></i>
                      <span>Logout</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="action-item login-btn" onClick={() => goTo('/login')}>
              <i className="fas fa-user"></i>
              <span>Login</span>
            </div>
          )}
        </div>
      </div>

      {isProductsOpen && (
        <div className="mega-panel">
          <div className="categories-content">
            <div className="categories-column featured">
              <h3 className="column-title">Core Components</h3>
              <div className="featured-grid">
                <div className="featured-item" onClick={() => { goTo('/components/cpu'); setIsProductsOpen(false); }}>
                  <div className="featured-img-container">
                    <img src="https://cdna.pcpartpicker.com/static/forever/img/nav-cpu-2023.png" alt="CPU" />
                  </div>
                  <span>CPUs</span>
                </div>
                <div className="featured-item" onClick={() => { goTo('/components/cpu cooler'); setIsProductsOpen(false); }}>
                  <div className="featured-img-container">
                    <img src="//cdna.pcpartpicker.com/static/forever/img/nav-cpucooler-2023.png" alt="CPU Cooler" />
                  </div>
                  <span>CPU Coolers</span>
                </div>
                <div className="featured-item" onClick={() => { goTo('/components/mainboard'); setIsProductsOpen(false); }}>
                  <div className="featured-img-container">
                    <img src="//cdna.pcpartpicker.com/static/forever/img/nav-motherboard-2023.png" alt="Motherboard" />
                  </div>
                  <span>Motherboards</span>
                </div>
                <div className="featured-item" onClick={() => { goTo('/components/ram'); setIsProductsOpen(false); }}>
                  <div className="featured-img-container">
                    <img src="//cdna.pcpartpicker.com/static/forever/img/nav-memory-2023.png" alt="Memory" />
                  </div>
                  <span>Memory</span>
                </div>
                <div className="featured-item" onClick={() => { goTo('/components/storage'); setIsProductsOpen(false); }}>
                  <div className="featured-img-container">
                    <img src="//cdna.pcpartpicker.com/static/forever/img/nav-ssd-2023.png" alt="Storage" />
                  </div>
                  <span>Storage</span>
                </div>
                <div className="featured-item" onClick={() => { goTo('/components/gpu'); setIsProductsOpen(false); }}>
                  <div className="featured-img-container">
                    <img src="//cdna.pcpartpicker.com/static/forever/img/nav-videocard-2023.png" alt="Video Card" />
                  </div>
                  <span>Video Cards</span>
                </div>
                <div className="featured-item" onClick={() => { goTo('/components/psu'); setIsProductsOpen(false); }}>
                  <div className="featured-img-container">
                    <img src="//cdna.pcpartpicker.com/static/forever/img/nav-powersupply-2023.png" alt="Power Supply" />
                  </div>
                  <span>Power Supplies</span>
                </div>
                <div className="featured-item" onClick={() => { goTo('/components/case'); setIsProductsOpen(false); }}>
                  <div className="featured-img-container">
                    <img src="//cdna.pcpartpicker.com/static/forever/img/nav-case-2023.png" alt="Case" />
                  </div>
                  <span>Cases</span>
                </div>
              </div>
            </div>

            <div className="categories-column lists">
              <div className="category-list">
                <h3 className="list-title">Peripherals</h3>
                <ul>
                  <li >Headphones</li>
                  <li >Keyboards</li>
                  <li >Mice</li>
                  <li >Speakers</li>
                  <li >Webcams</li>
                </ul>
              </div>

              <div className="category-list">
                <h3 className="list-title">Displays</h3>
                <ul>
                  <li >Monitors</li>
                </ul>
              </div>
            </div>

            <div className="categories-column lists">
              <div className="category-list">
                <h3 className="list-title">Expansion</h3>
                <ul>
                  <li >Sound Cards</li>
                  <li >Wired Networking</li>
                  <li >Wireless Networking</li>
                </ul>
              </div>

              <div className="category-list">
                <h3 className="list-title">Accessories</h3>
                <ul>
                  <li >Case Fans</li>
                  <li >Fan Controllers</li>
                  <li >Thermal Compound</li>
                  <li >External Drives</li>
                </ul>
              </div>

              <div className="category-list">
                <h3 className="list-title">Software</h3>
                <ul>
                  <li >Operating Systems</li>
                </ul>
              </div>
            </div>

            <div className="categories-column promo">
              <div className="promo-card">
                <div className="promo-content">
                  <h3>Build Without Limits</h3>
                  <p>Start from scratch, compare parts instantly, and craft a setup that fits your style.</p>
                  <button className="promo-btn" onClick={() => { goTo('/build'); setIsProductsOpen(false); }}>
                    Start Building
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Header;