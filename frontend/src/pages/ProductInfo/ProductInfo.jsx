import React, { useContext, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchProductById, fetchProductsByCategoryId } from "../../services/productService.js";
import { UserContext } from "../../context/UserProvider";
import { FaStar, FaStarHalfAlt, FaRegStar, FaShoppingCart, FaChevronDown, FaChevronUp } from "react-icons/fa";
import { toast } from "react-toastify";
import { addToCart } from "../../services/apiService.js";
import "./ProductInfo.css";

// const extractRating = (ratingText) => {
//   if (!ratingText) return null;
//   const match = ratingText.match(/([\d.]+) out of 5 stars/);
//   return match ? parseFloat(match[1]) : null;
// };

const RatingStars = ({ rating }) => {
  if (typeof rating !== "number" || rating < 0 || rating > 5) {
    return <p className="pi-no-rating">No ratings yet</p>;
  }

  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5 ? 1 : 0;
  const emptyStars = 5 - fullStars - halfStar;

  return (
    <div className="pi-rating-stars">
      {Array.from({ length: fullStars }, (_, i) => <FaStar key={`full-${i}`} />)}
      {halfStar ? <FaStarHalfAlt key="half" /> : null}
      {Array.from({ length: emptyStars }, (_, i) => <FaRegStar key={`empty-${i}`} />)}
      <span className="pi-rating-count">{rating.toFixed(1)}</span>
    </div>
  );
};

const ProductImageGallery = ({ images }) => {
  const [mainImage, setMainImage] = useState(images ? images[0] : null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleThumbnailClick = (image, index) => {
    setMainImage(image);
    setSelectedIndex(index);
  };

  if (!images || images.length === 0) {
    return <div className="pi-product-no-image">No images available</div>;
  }

  return (
    <div className="pi-product-gallery">
      <div className="pi-main-image-container">
        <img src={mainImage} alt="Product" className="pi-main-image" />
      </div>
      <div className="pi-thumbnails">
        {images.map((image, index) => (
          <div
            key={index}
            className={`pi-thumbnail-wrapper ${index === selectedIndex ? 'pi-active' : ''}`}
            onClick={() => handleThumbnailClick(image, index)}
          >
            <img src={image} alt={`Thumbnail ${index + 1}`} className="pi-thumbnail" />
          </div>
        ))}
      </div>
    </div>
  );
};

const ProductInfo = () => {
  const { productId } = useParams();
  const { user, fetchUser } = useContext(UserContext);
  const navigate = useNavigate();

  const [productInfo, setProductInfo] = useState(null);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isSpecsExpanded, setIsSpecsExpanded] = useState(false);
  const stockCount = Number(productInfo?.stock ?? 0);
  const isOutOfStock = stockCount <= 0;

  useEffect(() => {
    if (isOutOfStock) {
      setQuantity(0);
      return;
    }

    if (quantity < 1) {
      setQuantity(1);
    }

    if (quantity > stockCount) {
      setQuantity(stockCount);
    }
  }, [isOutOfStock, stockCount, quantity]);

  // Fetch product details
  useEffect(() => {
    const fetchProductDetails = async () => {
      setLoading(true);
      try {
        const response = await fetchProductById(productId);
        if (response && response.error != null) {
          setError(response.error);
          setProductInfo(null);
        } else {
          setProductInfo(response);
          setError(null);

          // If we have category_id, fetch similar products
          if (response && response.category_id) {
            fetchSimilarProducts(response.product_id, response.category_id);
          }
        }
      } catch (err) {
        console.error("Error fetching product:", err);
        setError("Failed to load product details");
        setProductInfo(null);
      } finally {
        setLoading(false);
      }
    };

    if (productId) {
      fetchProductDetails();
    }
  }, [productId]);

  // Function to fetch similar products by category
  const fetchSimilarProducts = async (currentProductId, categoryId) => {
    try {
      const response = await fetchProductsByCategoryId(categoryId);

      if (response && response.error != null) {
        console.error("Error fetching similar products:", response.error);
      } else {
        // Filter out the current product and limit to 8
        const filtered = response
          .filter(prod => prod.product_id !== currentProductId)
          .slice(0, 6);
        setSimilarProducts(filtered);
      }
    } catch (err) {
      console.error("Error fetching similar products:", err);
    }
  };

  const rating = productInfo ? (parseFloat(productInfo.rating) || 0) : 0;
  const unitPrice = Number(productInfo?.price || 0);
  const totalPrice = unitPrice * quantity;
  const displayPrice = quantity > 0 ? totalPrice : unitPrice;

  // Prepare product images
  const productImages = productInfo?.image
    ? productInfo.image.split('; ').filter(img => img && img.trim().length > 0)
    : [];

  const specsEntries = productInfo?.attributes
    ? Object.entries(productInfo.attributes).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    : [];

  const hasMoreSpecs = specsEntries.length > 7;
  const visibleSpecs = isSpecsExpanded ? specsEntries : specsEntries.slice(0, 7);

  // Handle quantity changes
  const decreaseQuantity = () => {
    if (quantity > 1) setQuantity(quantity - 1);
  };

  const increaseQuantity = () => {
    if (isOutOfStock) return;
    setQuantity((currentQuantity) => Math.min(currentQuantity + 1, stockCount));
  };

  const handleAddToCart = async () => {
    if (!productInfo) {
      toast.error("Product not found!");
      return;
    }
    if (!(user && user.isAuthenticated)) {
      toast.error("You must be logged in to add products to the cart!");
      navigate('/login');
      return;
    }
    if (isOutOfStock) {
      toast.error("This product is out of stock.");
      return;
    }
    try {
      const response = await addToCart(user.account.id, productInfo.product_id, quantity);
      if (response && response.errCode === 0) {
        toast.success(`${quantity} ${quantity > 1 ? 'items' : 'item'} added to cart successfully!`);
        fetchUser();
      } else {
        toast.error(response?.error || "Failed to add product to cart.");
      }
    } catch (error) {
      console.error("Error adding product to cart:", error);
      toast.error("An error occurred while adding the product to the cart.");
    }
  };

  // Handle the buy now action
  const handleBuyNow = () => {
    if (!productInfo) return;
    if (isOutOfStock) {
      toast.error("This product is out of stock.");
      return;
    }
    const item = {
      product_id: productInfo.product_id,
      price: productInfo.price,
      title: productInfo.title,
      quantity,
    };
    console.log("Item to buy now:", item);
    const amount = productInfo.price ? productInfo.price * quantity : 0;
    const isBuyNow = true;
    const items = [item];
    const formValue = { items, amount, isBuyNow };
    navigate("/checkout", {
      state: { formValue }
    });
  };

  if (loading) {
    return <div className="pi-loading">Loading product details...</div>;
  }

  if (error || !productInfo) {
    return (
      <div className="pi-product-not-found">
        <h2>Product Not Found</h2>
        <p>{error || "We couldn't find the product you're looking for."}</p>
        <button onClick={() => navigate('/')} className="pi-return-home">
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className="pi-product-page">
      <div className="pi-product-container">
        {/* Product Gallery Section */}
        <section className="pi-product-media">
          <ProductImageGallery images={productImages} />
        </section>

        {/* Product Information Section */}
        <section className="pi-product-details">
          <div className="pi-product-header">
            <h1 className="pi-product-title">{productInfo.title}</h1>

            <div className="pi-product-meta">
              <div className="pi-product-rating-container">
                <RatingStars rating={rating} />
                <span className="pi-review-count">
                  {productInfo.reviews ? `(${productInfo.reviews} reviews)` : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="pi-product-pricing">
            <div className="pi-current-price">
              {unitPrice ? `$${displayPrice.toLocaleString()}` : "Price not available"}
            </div>
            {unitPrice > 0 && quantity > 1 && (
              <div className="pi-price-breakdown">
                {`$${unitPrice.toLocaleString()} x ${quantity}`}
              </div>
            )}
            {productInfo.originalPrice && (
              <div className="pi-original-price">
                ${productInfo.originalPrice.toLocaleString()}
              </div>
            )}
            {productInfo.discount && <div className="pi-discount-badge">-{productInfo.discount}%</div>}
            <div className={`pi-stock-badge ${isOutOfStock ? "pi-stock-out" : "pi-stock-in"}`}>
              {isOutOfStock ? "Out of stock" : `${stockCount} in stock`}
            </div>
          </div>

          {/* <div className="pi-product-description">
            <div className={`pi-description-content ${isDescriptionExpanded ? 'pi-expanded' : ''}`}>
              {productInfo.description || "No description available."}
            </div>
            {productInfo.description && productInfo.description.length > 200 && (
              <button
                className="pi-read-more"
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
              >
                {isDescriptionExpanded ? 'Read less' : 'Read more'}
              </button>
            )}
          </div> */}

          <div className="pi-product-actions">
            <div className="pi-quantity-selector">
              <button
                onClick={decreaseQuantity}
                className="pi-quantity-btn pi-quantity-btn-left"
                disabled={isOutOfStock || quantity <= 1}
              >
                -
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => {
                  if (isOutOfStock) {
                    setQuantity(0);
                    return;
                  }

                  const nextQuantity = Math.max(1, parseInt(e.target.value, 10) || 1);
                  setQuantity(Math.min(nextQuantity, stockCount));
                }}
                min={isOutOfStock ? "0" : "1"}
                max={stockCount || undefined}
                className="pi-quantity-input"
                disabled={isOutOfStock}
              />
              <button
                onClick={increaseQuantity}
                className="pi-quantity-btn pi-quantity-btn-right"
                disabled={isOutOfStock || quantity >= stockCount}
              >
                +
              </button>
            </div>

            <div className="pi-action-buttons">
              <button
                onClick={handleAddToCart}
                className="pi-add-to-cart-btn"
                disabled={isOutOfStock}
              >
                <FaShoppingCart /> Add to Cart
              </button>
              <button
                onClick={handleBuyNow}
                className="pi-buy-now-btn"
                disabled={isOutOfStock}
              >
                {isOutOfStock ? "Out of Stock" : "Buy Now"}
              </button>
            </div>

            {/* <div className="pi-secondary-actions">
              <button className="pi-wishlist-btn">
                <FaHeart /> Save
              </button>
              <button className="pi-share-btn">
                <IoShareSocialOutline /> Share
              </button>
            </div> */}
          </div>

          {/* Product Specifications */}
          <div className="pi-product-specs-section">
            <h2 className="pi-section-title">Specifications</h2>
            <div className="pi-specs-card">
              <div className="pi-specs-container">
                {visibleSpecs.map(([key, value]) => {
                return (
                  <div className="pi-spec-item" key={key}>
                    <div className="pi-spec-name">{key.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase())}</div>
                    <div className="pi-spec-value">{value.toString()}</div>
                  </div>
                );
                })}
              </div>

              {hasMoreSpecs && (
                <button
                  type="button"
                  className="pi-specs-toggle"
                  onClick={() => setIsSpecsExpanded(!isSpecsExpanded)}
                >
                  {isSpecsExpanded ? <FaChevronUp /> : <FaChevronDown />}
                  {isSpecsExpanded ? "See less" : "See more"}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Similar Products Section */}
      {similarProducts.length > 0 && (
        <section className="pi-similar-products-section">
          <h2 className="pi-section-title">Similar Products</h2>
          <div className="pi-similar-products-grid">
            {similarProducts.map((product) => (
              <div
                key={product.product_id}
                className="pi-similar-product-card"
                onClick={() => navigate(`/product-info/${product.product_id}`)}
              >
                <div className="pi-similar-product-img-container">
                  <img
                    src={product.image ? product.image.split('; ')[0] : "/default-image.jpg"}
                    alt={product.title || "Product"}
                    className="pi-similar-product-img"
                  />
                </div>
                <div className="pi-similar-product-info">
                  <h3 className="pi-similar-product-title">
                    {product.title
                      ? product.title.length > 40
                        ? `${product.title.substring(0, 40)}...`
                        : product.title
                      : "No title"}
                  </h3>
                  <div className="pi-similar-product-price">
                    {product.price ? `$${product.price.toLocaleString()}` : "N/A"}
                  </div>
                  {product.rating && (
                    <div className="pi-similar-product-rating">
                      <RatingStars rating={Number(product.rating)} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProductInfo;