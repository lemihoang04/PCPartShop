import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBuildBySlug } from '../../services/buildpcService';
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
    return <div className="sbd-product-no-image">Không có hình ảnh cấu hình</div>;
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
  const [build, setBuild] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBuildDetails = async () => {
      try {
        setLoading(true);
        const response = await getBuildBySlug(slug);
        if (response) {
          setBuild(response);
        } else {
          setError('Không tìm thấy cấu hình này.');
        }
      } catch (err) {
        console.error('Error loading build details:', err);
        setError('Có lỗi xảy ra khi tải chi tiết cấu hình. Vui lòng thử lại sau.');
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
    let cpu = 'Chưa chọn CPU';
    let gpu = 'Chưa chọn GPU';
    let memory = 'Chưa chọn RAM';
    let storage = 'Chưa chọn Storage';
    let cases = 'Chưa chọn Case';
    let psu = 'Chưa chọn Nguồn (PSU)';

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
        memory = modules ? `${modules} ${speed}` : item.title;
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
        <p>Đang tải chi tiết cấu hình PC...</p>
      </div>
    );
  }

  if (error || !build) {
    return (
      <div className="sbd-error-container">
        <div className="sbd-error-card">
          <h2>Có lỗi xảy ra</h2>
          <p>{error || 'Không tìm thấy cấu hình bạn yêu cầu.'}</p>
          <button className="sbd-back-btn" onClick={() => navigate('/shared-builds')}>
            <FaArrowLeft /> Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sbd-product-page">
      {/* Back button link */}
      <div className="sbd-breadcrumb-row">
        <button className="sbd-back-text-btn" onClick={() => navigate('/shared-builds')}>
          <FaArrowLeft /> Quay lại danh sách shared builds
        </button>
      </div>

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
                <FaUser className="sbd-icon-inline" /> {build.creator_name || 'Cộng đồng'}
              </span>
              <span className="sbd-date">
                <FaCalendarAlt className="sbd-icon-inline" /> {new Date(build.created_at).toLocaleDateString('vi-VN')}
              </span>
              <RatingStars rating={5} />
            </div>
          </div>

          {/* Pricing Block */}
          <div className="sbd-product-pricing">
            <span className="sbd-price-label">Tổng chi phí dự kiến:</span>
            <div className="sbd-current-price">
              <FaDollarSign className="sbd-currency-icon" />
              <span>{buildData.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Description Block */}
          <div className="sbd-build-description">
            <p>{build.description || 'Cấu hình tối ưu được chia sẻ bởi cộng đồng TechShop.'}</p>
          </div>

          {/* Call-to-action Action Bar redirects to Build Page with slug */}
          <div className="sbd-product-actions">
            <button 
              className="sbd-use-build-btn"
              onClick={() => navigate(`/build/${build.slug}`)}
            >
              <FaTools /> Sử dụng cấu hình này
            </button>
          </div>

          {/* Core 6-index specifications block (as requested in mockup) */}
          <div className="sbd-six-specs-section">
            <h2 className="sbd-specs-title">Thông số cấu hình cốt lõi</h2>
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

      {/* Structured Components Table List (replaces Similar Products) */}
      <section className="sbd-components-table-section">
        <h2 className="sbd-section-title">Danh sách chi tiết linh kiện</h2>
        <div className="sbd-table-wrapper">
          <table className="sbd-components-table">
            <thead>
              <tr>
                <th style={{ width: '18%' }}>Loại linh kiện</th>
                <th style={{ width: '10%', textAlign: 'center' }}>Hình ảnh</th>
                <th>Tên sản phẩm</th>
                <th style={{ width: '10%', textAlign: 'center' }}>Số lượng</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Đơn giá</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Thành tiền</th>
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
                <td className="sbd-table-footer-label">Tổng cộng:</td>
                <td className="sbd-table-footer-value">${buildData.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
};

export default SharedBuildDetail;
