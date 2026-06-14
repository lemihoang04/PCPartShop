import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBuildBySlug, getBuildComments, addBuildComment } from '../../services/buildpcService';
import { UserContext } from '../../context/UserProvider';
import './SharedBuildDetail.css';
import {
  FaMicrochip,
  FaVideo,
  FaMemory,
  FaHdd,
  FaCube,
  FaBolt,
  FaTools,
  FaUser,
  FaCalendarAlt,
  FaArrowLeft,
  FaDollarSign,
  FaExternalLinkAlt
} from 'react-icons/fa';

// Component: Rating stars (consistent fallback with ProductInfo)
const RatingStars = ({ rating }) => {
  return (
    <div className="sbd-rating-stars">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`sbd-star ${i < rating ? 'sbd-filled' : ''}`}>★</span>
      ))}
      <span className="sbd-rating-count">{(rating || 5.0).toFixed(1)}</span>
    </div>
  );
};

// Component: Gallery displaying Case first, then others
const BuildImageGallery = ({ images }) => {
  const [mainImage, setMainImage] = useState(images ? images[0] : null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (images && images.length > 0) {
      setMainImage(images[0]);
      setSelectedIndex(0);
    }
  }, [images]);

  const handleThumbnailClick = (image, index) => {
    setMainImage(image);
    setSelectedIndex(index);
  };

  if (!images || images.length === 0) {
    return <div className="sbd-product-no-image">No build images available</div>;
  }

  return (
    <div className="sbd-product-gallery">
      <div className="sbd-main-image-container">
        <img src={mainImage} alt="Main Build Component" className="sbd-main-image" />
      </div>
      <div className="sbd-thumbnails">
        {images.map((image, index) => (
          <div
            key={index}
            className={`sbd-thumbnail-wrapper ${index === selectedIndex ? 'sbd-active' : ''}`}
            onClick={() => handleThumbnailClick(image, index)}
          >
            <img src={image} alt={`Thumbnail ${index + 1}`} className="sbd-thumbnail" />
          </div>
        ))}
      </div>
    </div>
  );
};

const SharedBuildDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = React.useContext(UserContext);
  const [build, setBuild] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null); // holds the comment id being replied to
  const [submittingComment, setSubmittingComment] = useState(false);

  const loadComments = async (buildId) => {
    try {
      const res = await getBuildComments(buildId);
      // Assuming interceptor unwraps, otherwise res.data
      setComments(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      setSubmittingComment(true);
      await addBuildComment(build.id, commentText, replyTo);
      setCommentText('');
      setReplyTo(null);
      await loadComments(build.id);
    } catch (err) {
      console.error('Error adding comment:', err);
      alert('Cannot add comment. Please log in or try again later.');
    } finally {
      setSubmittingComment(false);
    }
  };

  useEffect(() => {
    const fetchBuildDetails = async () => {
      try {
        setLoading(true);
        const response = await getBuildBySlug(slug);
        if (response) {
          setBuild(response);
          await loadComments(response.id);
        } else {
          setError('Build configuration not found.');
        }
      } catch (err) {
        console.error('Error loading build details:', err);
        setError('An error occurred while loading the build details. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchBuildDetails();
    }
  }, [slug]);

  // Compute stats and structures once build is loaded
  const buildData = React.useMemo(() => {
    if (!build || !build.items) return null;

    let totalPrice = 0;
    let cpu = 'No CPU selected';
    let gpu = 'No GPU selected';
    const ramParts = [];
    const ramTypes = new Set();
    let storage = 'No storage selected';
    let cases = 'No case selected';
    let psu = 'No PSU selected';

    const caseItem = build.items.find(item => String(item.category_name).toLowerCase() === 'case');
    const otherItems = build.items.filter(item => String(item.category_name).toLowerCase() !== 'case');

    // 1. Gather all unique images with Case images FIRST
    const imagesList = [];
    if (caseItem && caseItem.image) {
      caseItem.image.split('; ').forEach(img => {
        if (img && img.trim() && !imagesList.includes(img)) imagesList.push(img);
      });
    }
    otherItems.forEach(item => {
      if (item.image) {
        item.image.split('; ').forEach(img => {
          if (img && img.trim() && !imagesList.includes(img)) imagesList.push(img);
        });
      }
    });

    if (imagesList.length === 0) {
      imagesList.push('https://via.placeholder.com/600x600?text=No+Image+Available');
    }

    // 2. Extract specs and sum totalPrice
    build.items.forEach(item => {
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity) || 1;
      totalPrice += price * qty;

      const catName = String(item.category_name).toLowerCase();
      if (catName === 'cpu') {
        cpu = item.title;
      } else if (catName === 'gpu') {
        const chipset = item.attributes?.['Chipset'] || item.title;
        const mem = item.attributes?.['Memory'] || '';
        gpu = mem ? `${chipset} (${mem})` : chipset;
      } else if (catName === 'ram') {
        const modules = item.attributes?.['Modules'] || '';
        const speed = item.attributes?.['Speed'] || '';
        // Parse "2 x 16GB" format to get total GB
        const match = modules.match(/(\d+)\s*x\s*(\d+)\s*GB/i);
        if (match) {
          ramParts.push(parseInt(match[1]) * parseInt(match[2]));
        } else {
          const gbMatch = modules.match(/(\d+)\s*GB/i);
          if (gbMatch) ramParts.push(parseInt(gbMatch[1]));
        }
        // Extract RAM type (e.g. "DDR5" from "DDR5-6000")
        const typeMatch = speed.match(/(DDR\d+)/i);
        if (typeMatch) ramTypes.add(typeMatch[1].toUpperCase());
      } else if (catName === 'storage') {
        const cap = item.attributes?.['Capacity'] || '';
        const type = item.attributes?.['Type'] || '';
        storage = cap ? `${cap} ${type}`.trim() : item.title;
      } else if (catName === 'case') {
        cases = item.title;
      } else if (catName === 'psu') {
        const watt = item.attributes?.['Wattage'] || '';
        const eff = item.attributes?.['Efficiency rating'] || '';
        psu = watt ? `${watt} ${eff}`.trim() : item.title;
      }
    });

    const totalRamGB = ramParts.length > 0 ? ramParts.reduce((a, b) => a + b, 0) : 0;
    const ramTypeStr = ramTypes.size > 0 ? ` (${[...ramTypes].join(', ')})` : '';
    const memory = totalRamGB > 0 ? `${totalRamGB}GB${ramTypeStr}` : 'No RAM selected';

    return {
      images: imagesList,
      totalPrice,
      cpu,
      gpu,
      memory,
      storage,
      cases,
      psu
    };
  }, [build]);

  if (loading) {
    return (
      <div className="sbd-loading-container">
        <div className="sbd-spinner"></div>
        <p>Loading PC build details...</p>
      </div>
    );
  }

  if (error || !build) {
    return (
      <div className="sbd-error-container">
        <div className="sbd-error-card">
          <h2>An error occurred</h2>
          <p>{error || 'The requested build configuration was not found.'}</p>
          <button className="sbd-back-btn" onClick={() => navigate('/shared-builds')}>
            <FaArrowLeft /> Back to list
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sbd-product-page">
      {/* Back button link */}
      {/* <div className="sbd-breadcrumb-row">
        <button className="sbd-back-text-btn" onClick={() => navigate('/shared-builds')}>
          <FaArrowLeft /> Back to shared builds list
        </button>
      </div> */}

      <div className="sbd-product-container">
        {/* Left Side: Images column loaded starting with Case */}
        <section className="sbd-product-media">
          <BuildImageGallery images={buildData.images} />
        </section>

        {/* Right Side: Shared Build details info */}
        <section className="sbd-product-details">
          <div className="sbd-product-header">
            <h1 className="sbd-product-title">{build.build_name}</h1>

            <div className="sbd-build-meta-row">
              <span className="sbd-author">
                <FaUser className="sbd-icon-inline" /> {build.creator_name || 'Community'}
              </span>
              <span className="sbd-date">
                <FaCalendarAlt className="sbd-icon-inline" /> {new Date(build.created_at).toLocaleDateString('en-US')}
              </span>
              {/* <RatingStars rating={5} /> */}
            </div>
          </div>

          {/* Pricing Block */}
          <div className="sbd-product-pricing">
            <span className="sbd-price-label">Estimated Total Price:</span>
            <div className="sbd-current-price">
              <FaDollarSign className="sbd-currency-icon" />
              <span>{buildData.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Description Block */}
          <div className="sbd-build-description">
            <p>{build.description || 'Optimized PC configuration shared by the TechShop community.'}</p>
          </div>

          {/* Call-to-action Action Bar redirects to Build Page with slug */}
          <div className="sbd-product-actions">
            <button
              className="sbd-use-build-btn"
              onClick={() => navigate(`/build/${build.slug}`)}
            >
              <FaTools /> Use this build
            </button>
          </div>

          {/* Core 6-index specifications block (as requested in mockup) */}
          <div className="sbd-six-specs-section">
            <h2 className="sbd-specs-title">Core Specifications</h2>
            <div className="sbd-six-specs-grid">

              <div className="sbd-grid-spec-item">
                <div className="sbd-grid-icon-box">
                  <FaMicrochip className="sbd-grid-icon" />
                </div>
                <div className="sbd-grid-text-box">
                  <span className="sbd-grid-label">CPU</span>
                  <span className="sbd-grid-value" title={buildData.cpu}>{buildData.cpu}</span>
                </div>
              </div>

              <div className="sbd-grid-spec-item">
                <div className="sbd-grid-icon-box">
                  <FaVideo className="sbd-grid-icon" />
                </div>
                <div className="sbd-grid-text-box">
                  <span className="sbd-grid-label">GPU</span>
                  <span className="sbd-grid-value" title={buildData.gpu}>{buildData.gpu}</span>
                </div>
              </div>

              <div className="sbd-grid-spec-item">
                <div className="sbd-grid-icon-box">
                  <FaMemory className="sbd-grid-icon" />
                </div>
                <div className="sbd-grid-text-box">
                  <span className="sbd-grid-label">MEMORY</span>
                  <span className="sbd-grid-value" title={buildData.memory}>{buildData.memory}</span>
                </div>
              </div>

              <div className="sbd-grid-spec-item">
                <div className="sbd-grid-icon-box">
                  <FaHdd className="sbd-grid-icon" />
                </div>
                <div className="sbd-grid-text-box">
                  <span className="sbd-grid-label">STORAGE</span>
                  <span className="sbd-grid-value" title={buildData.storage}>{buildData.storage}</span>
                </div>
              </div>

              <div className="sbd-grid-spec-item">
                <div className="sbd-grid-icon-box">
                  <FaCube className="sbd-grid-icon" />
                </div>
                <div className="sbd-grid-text-box">
                  <span className="sbd-grid-label">CASE</span>
                  <span className="sbd-grid-value" title={buildData.cases}>{buildData.cases}</span>
                </div>
              </div>

              <div className="sbd-grid-spec-item">
                <div className="sbd-grid-icon-box">
                  <FaBolt className="sbd-grid-icon" />
                </div>
                <div className="sbd-grid-text-box">
                  <span className="sbd-grid-label">POWER SUPPLY</span>
                  <span className="sbd-grid-value" title={buildData.psu}>{buildData.psu}</span>
                </div>
              </div>

            </div>
          </div>
        </section>
      </div>

      <div className="sbd-bottom-grid">
        {/* Structured Components Table List (replaces Similar Products) */}
        <section className="sbd-components-table-section">
          <h2 className="sbd-section-title">Detailed Parts List</h2>
          <div className="sbd-table-wrapper">
            <table className="sbd-components-table">
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>Component Type</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>Image</th>
                  <th>Product Name</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>Quantity</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Unit Price</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Total Price</th>
                </tr>
              </thead>
              <tbody>
                {build.items.map((item) => {
                  const price = parseFloat(item.price) || 0;
                  const qty = parseInt(item.quantity) || 1;
                  const subtotal = price * qty;
                  const itemImg = item.image ? item.image.split('; ')[0] : 'https://via.placeholder.com/150x150?text=No+Image';

                  return (
                    <tr key={item.item_id}>
                      <td className="sbd-col-category">
                        <span className="sbd-category-badge">{item.category_name}</span>
                      </td>
                      <td className="sbd-col-img">
                        <div className="sbd-product-table-img" onClick={() => navigate(`/product-info/${item.product_id}`)}>
                          <img src={itemImg} alt={item.title} />
                        </div>
                      </td>
                      <td className="sbd-col-title">
                        <div
                          className="sbd-product-table-link"
                          onClick={() => navigate(`/product-info/${item.product_id}`)}
                        >
                          {item.title} <FaExternalLinkAlt className="sbd-link-icon" />
                        </div>
                      </td>
                      <td className="sbd-col-qty">{qty}</td>
                      <td className="sbd-col-price">${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="sbd-col-subtotal">${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4"></td>
                  <td className="sbd-table-footer-label">Total:</td>
                  <td className="sbd-table-footer-value">${buildData.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Comments Section */}
        <section className="sbd-comments-section">
          <h2 className="sbd-section-title">Comments</h2>
          
          <div className="sbd-comments-list">
            {comments.length === 0 ? (
              <p className="sbd-no-comments">No comments yet. Be the first to comment!</p>
            ) : (
              comments.map(comment => (
                <div 
                  key={comment.id} 
                  className={`sbd-comment-item ${comment.parent_comment_id ? 'sbd-comment-reply' : ''}`}
                >
                  <div className="sbd-comment-avatar">
                    {comment.user_name ? comment.user_name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="sbd-comment-content-wrapper">
                    <div className="sbd-comment-header">
                      <span className="sbd-comment-author">{comment.user_name || 'Anonymous'}</span>
                      <span className="sbd-comment-date">{new Date(comment.created_at).toLocaleString('en-US')}</span>
                    </div>
                    <p className="sbd-comment-text">{comment.content}</p>
                    <button 
                      className="sbd-comment-reply-btn"
                      onClick={() => setReplyTo(comment.parent_comment_id ? comment.parent_comment_id : comment.id)}
                    >
                      Reply
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="sbd-comment-input-area">
            {user && user.isAuthenticated ? (
              <>
                {replyTo && (
                  <div className="sbd-replying-indicator">
                    Replying to comment...
                    <button onClick={() => setReplyTo(null)}>Cancel</button>
                  </div>
                )}
                <textarea
                  className="sbd-comment-textarea"
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows="3"
                ></textarea>
                <button 
                  className="sbd-comment-submit-btn" 
                  onClick={handleAddComment}
                  disabled={submittingComment || !commentText.trim()}
                >
                  {submittingComment ? 'Submitting...' : 'Post comment'}
                </button>
              </>
            ) : (
              <p className="sbd-login-prompt">Please <a onClick={() => navigate('/login')}>log in</a> to comment.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SharedBuildDetail;
