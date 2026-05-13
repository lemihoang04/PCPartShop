import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFeaturedProducts } from '../../services/productService';
import './Home.css';
import BuiLdPCImg from '../../assets/images/buildpc.png';

const Home = () => {
    const navigate = useNavigate();
    const [currentSlide, setCurrentSlide] = useState(0);
    const [featuredProducts, setFeaturedProducts] = useState([]);

    const categories = [
        { id: 1, name: 'Graphics Cards', icon: 'fa-microchip', route: '/components/gpu' },
        { id: 2, name: 'Processors', icon: 'fa-server', route: '/components/cpu' },
        { id: 3, name: 'Motherboards', icon: 'fa-puzzle-piece', route: '/components/mainboard' },
        { id: 4, name: 'Memory', icon: 'fa-memory', route: '/components/ram' },
        { id: 5, name: 'Storage', icon: 'fa-hard-drive', route: '/components/storage' },
        { id: 6, name: 'Cases', icon: 'fa-desktop', route: '/components/case' },
        { id: 7, name: 'Power Supplies', icon: 'fa-plug', route: '/components/psu' },
        { id: 8, name: 'Cooling', icon: 'fa-fan', route: '/components/cpu cooler' }
    ];

    const banners = [
        {
            id: 1,
            title: 'Build the Blue Beast',
            subtitle: 'High-end gaming setups with best price/performance picks.',
            cta: 'Build Your PC',
            badge: 'Best Seller',
            image: 'https://nzxt.com/cdn/shop/files/Shop_the_look_1.png?v=1770183972&width=2400',
            route: '/build'
        },
        {
            id: 2,
            title: 'Components That Fit',
            subtitle: 'From entry-level to enthusiast, every part in one place.',
            cta: 'Shop Components',
            badge: 'New Arrivals',
            image: 'https://nzxt.com/cdn/shop/files/Special_Offers_adfb08a1-d891-4bab-b852-a92f01441688.png?v=1774793945&width=1800',
            route: '/components/gpu'
        },
        {
            id: 3,
            title: 'Laptop Deals This Week',
            subtitle: 'Portable power for editing, coding, and esports.',
            cta: 'View Laptops',
            badge: 'Hot Deals',
            image: 'https://i.dell.com/sites/csimages/App-Merchandizing_Images/all/1537_US_LP_G_Series_LOB_Banner_2800x839.jpg',
            route: '/laptops'
        }
    ];

    const specialDeals = [
        { id: 1, title: 'Build and Save', description: 'Save up to 15% for complete system orders.', icon: 'fa-tools', route: '/build' },
        { id: 2, title: 'Genuine Products', description: 'All products are authentic.', icon: 'fa-shield-alt', route: '/shipping' },
        { id: 3, title: 'Compatibility Check', description: 'Automatic conflict checking while building.', icon: 'fa-screwdriver-wrench', route: '/build' },
        { id: 4, title: 'Expert Support', description: 'Real-time support from PC specialists.', icon: 'fa-headset', route: '/support' }
    ];

    const testimonials = [
        {
            id: 1,
            name: 'Jason R.',
            comment: 'The builder flow is clean and easy. I finished my full setup in under 20 minutes.',
            rating: 5
        },
        {
            id: 2,
            name: 'Michelle K.',
            comment: 'Great product selection and very clear filters. Support team answered every question fast.',
            rating: 5
        },
        {
            id: 3,
            name: 'David L.',
            comment: 'Strong pricing, trusted brands, and smooth checkout. This is my go-to shop now.',
            rating: 4
        }
    ];

    useEffect(() => {
        const getFeaturedProducts = async () => {
            try {
                const products = await fetchFeaturedProducts();
                setFeaturedProducts(Array.isArray(products) ? products : []);
            } catch (error) {
                console.error('Failed to fetch featured products:', error);
                setFeaturedProducts([]);
            }
        };

        getFeaturedProducts();
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev === banners.length - 1 ? 0 : prev + 1));
        }, 5000);

        return () => clearInterval(interval);
    }, [banners.length]);

    const goToSlide = (index) => {
        setCurrentSlide(index);
    };

    const RatingStars = ({ rating }) => (
        <div className="techshop-rating">
            {[...Array(5)].map((_, i) => (
                <i key={i} className={`fas fa-star ${i < Math.floor(rating || 0) ? 'techshop-rating__star--filled' : 'techshop-rating__star--empty'}`}></i>
            ))}
            <span className="techshop-rating__number">{Number(rating || 0).toFixed(1)}</span>
        </div>
    );

    const formatMoney = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value);
        if (Number.isNaN(num)) {
            return '$0.00';
        }
        return `$${num.toFixed(2)}`;
    };

    return (
        <div className="techshop">
            <section className="techshop-hero">
                <div className="techshop-hero__container">
                    {banners.map((banner, index) => (
                        <article
                            key={banner.id}
                            className={`techshop-hero__slide ${index === currentSlide ? 'techshop-hero__slide--active' : ''}`}
                            style={{ backgroundImage: `url(${banner.image})` }}
                        >
                            <div className="techshop-hero__content">
                                <span className="techshop-hero__badge">{banner.badge}</span>
                                <h1 className="techshop-hero__title">{banner.title}</h1>
                                <p className="techshop-hero__subtitle">{banner.subtitle}</p>
                                <div className="techshop-hero__buttons">
                                    <button className="techshop-hero__button" onClick={() => navigate(banner.route)}>
                                        {banner.cta}
                                    </button>
                                    <button className="techshop-hero__ghost-btn" onClick={() => navigate('/components/cpu')}>
                                        Explore Parts
                                    </button>
                                </div>
                            </div>
                        </article>
                    ))}

                    <div className="techshop-hero__controls">
                        <div className="techshop-hero__dots">
                            {banners.map((_, index) => (
                                <button
                                    key={index}
                                    className={`techshop-hero__dot ${index === currentSlide ? 'techshop-hero__dot--active' : ''}`}
                                    onClick={() => goToSlide(index)}
                                    aria-label={`Go to banner ${index + 1}`}
                                ></button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="techshop-deals">
                <div className="techshop-deals__container">
                    {specialDeals.map((deal) => (
                        <article key={deal.id} className="techshop-deals__card" onClick={() => navigate(deal.route)}>
                            <div className="techshop-deals__icon">
                                <i className={`fas ${deal.icon}`}></i>
                            </div>
                            <div className="techshop-deals__info">
                                <h3 className="techshop-deals__title">{deal.title}</h3>
                                <p className="techshop-deals__description">{deal.description}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="techshop-products">
                <div className="techshop-section__header">
                    <h2 className="techshop-section__title">Featured Products</h2>
                    <button className="techshop-section__view-all" onClick={() => navigate('/components/cpu')}>
                        View All <i className="fas fa-arrow-right"></i>
                    </button>
                </div>

                <div className="techshop-products__grid">
                    {featuredProducts.map((product) => {
                        const basePrice = typeof product.price === 'number' ? product.price : parseFloat(product.price);
                        const discount = parseFloat(product.discount || 0);
                        const discountedPrice = basePrice * (1 - discount / 100);

                        return (
                            <article
                                key={product.id}
                                className="techshop-product"
                                onClick={() => navigate(`/product-info/${product.product_id}`)}
                            >
                                {discount > 0 && <div className="techshop-product__discount-badge">-{discount}%</div>}
                                <div className="techshop-product__image-container">
                                    <img src={product.image} alt={product.title} className="techshop-product__image" />
                                </div>
                                <div className="techshop-product__info">
                                    <span className="techshop-product__category">{product.category_name}</span>
                                    <h3 className="techshop-product__name">{product.title}</h3>
                                    <RatingStars rating={product.rating} />
                                    <div className="techshop-product__price">
                                        {discount > 0 ? (
                                            <>
                                                <span className="techshop-product__price--current">{formatMoney(discountedPrice)}</span>
                                                <span className="techshop-product__price--original">{formatMoney(basePrice)}</span>
                                            </>
                                        ) : (
                                            <span className="techshop-product__price--current">{formatMoney(basePrice)}</span>
                                        )}
                                    </div>
                                </div>
                                <button className="techshop-product__button">
                                    <i className="fas fa-shopping-cart"></i>
                                    Add to Cart
                                </button>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="techshop-builder-banner">
                <div className="techshop-builder-banner__content">
                    <div className="techshop-builder-banner__text">
                        <span className="techshop-builder-banner__label">PC Builder 2.0</span>
                        <h2 className="techshop-builder-banner__title">Build Smarter, Not Harder</h2>
                        <p className="techshop-builder-banner__description">
                            Select parts by performance target, budget range, and brand preference in one guided flow.
                        </p>
                        <button className="techshop-builder-banner__button" onClick={() => navigate('/build')}>
                            Start Building
                            <i className="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <div className="techshop-builder-banner__image-container">
                        <img src={BuiLdPCImg} alt="PC Builder" className="techshop-builder-banner__image" />
                    </div>
                </div>
            </section>

            <section className="techshop-categories">
                <div className="techshop-section__header">
                    <h2 className="techshop-section__title">Shop by Category</h2>
                </div>

                <div className="techshop-categories__grid">
                    {categories.map((category) => (
                        <article key={category.id} className="techshop-category" onClick={() => navigate(category.route)}>
                            <div className="techshop-category__icon">
                                <i className={`fas ${category.icon}`}></i>
                            </div>
                            <h4 className="techshop-category__name">{category.name}</h4>
                        </article>
                    ))}
                </div>
            </section>

            <section className="techshop-testimonials">
                <div className="techshop-section__header">
                    <h2 className="techshop-section__title">What Our Customers Say</h2>
                </div>

                <div className="techshop-testimonials__container">
                    {testimonials.map((testimonial) => (
                        <article key={testimonial.id} className="techshop-testimonial">
                            <div className="techshop-testimonial__rating">
                                {[...Array(5)].map((_, i) => (
                                    <i
                                        key={i}
                                        className={`fas fa-star ${i < testimonial.rating ? 'techshop-testimonial__star--filled' : 'techshop-testimonial__star--empty'}`}
                                    ></i>
                                ))}
                            </div>
                            <p className="techshop-testimonial__comment">"{testimonial.comment}"</p>
                            <p className="techshop-testimonial__author">- {testimonial.name}</p>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default Home;