import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSharedBuilds } from '../../services/buildpcService';
import './SharedBuild.css';
import {
  FaSearch,
  FaFilter,
  FaMicrochip,
  FaVideo,
  FaMemory,
  FaHdd,
  FaCube,
  FaUser,
  FaTools,
  FaChevronDown,
  FaChevronUp,
  FaDollarSign,
  FaCalendarAlt
} from 'react-icons/fa';

const SharedBuild = () => {
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [priceRange, setPriceRange] = useState([0, 10000]);
  const [sortOption, setSortOption] = useState('Newest');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9; // Grid of 3 columns

  // Filter selections
  const [filters, setFilters] = useState({
    cpuName: [],
    gpuChipset: []
  });

  const [expandedFilterSections, setExpandedFilterSections] = useState({
    price: true,
    cpuName: true,
    gpuChipset: true
  });

  const navigate = useNavigate();

  // Helper: Parse build products and extract specifications & prices
  const parseBuildSpecs = (build) => {
    let cpu = null;
    let gpu = null;
    let ram = null;
    let storages = [];
    let cases = null;
    let totalPrice = 0;

    const items = build.items || [];
    items.forEach(item => {
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity) || 1;
      totalPrice += price * qty;

      const catName = String(item.category_name).toLowerCase();
      if (catName === 'cpu') {
        cpu = item;
      } else if (catName === 'gpu') {
        gpu = item;
      } else if (catName === 'ram') {
        ram = item;
      } else if (catName === 'storage') {
        storages.push(item);
      } else if (catName === 'case') {
        cases = item;
      }
    });

    // Extract specs details
    const cpuName = cpu ? cpu.title : 'Chưa chọn CPU';
    const gpuChipset = gpu ? (gpu.attributes?.['Chipset'] || gpu.title) : 'Chưa chọn GPU';

    // RAM modules & speed
    let ramText = 'Chưa chọn RAM';
    if (ram) {
      const modules = ram.attributes?.['Modules'] || '';
      const speed = ram.attributes?.['Speed'] || '';
      ramText = modules ? `${modules} ${speed}` : ram.title;
    }

    // Storage capacity & type
    let storageText = 'Chưa chọn Storage';
    if (storages.length > 0) {
      storageText = storages.map(s => {
        const cap = s.attributes?.['Capacity'] || '';
        const type = s.attributes?.['Type'] || '';
        return cap ? `${cap} ${type}`.trim() : s.title;
      }).join(' + ');
    }

    // Compose split image strings (split by "; " if multiple)
    const caseImg = cases?.image ? cases.image.split('; ')[0] : 'https://via.placeholder.com/300x400?text=No+Case';
    const cpuImg = cpu?.image ? cpu.image.split('; ')[0] : 'https://via.placeholder.com/150x150?text=No+CPU';
    const gpuImg = gpu?.image ? gpu.image.split('; ')[0] : 'https://via.placeholder.com/150x150?text=No+GPU';

    return {
      cpuName,
      gpuChipset,
      ramText,
      storageText,
      totalPrice,
      caseImg,
      cpuImg,
      gpuImg,
      caseTitle: cases?.title || '',
      cpuTitle: cpu?.title || '',
      gpuTitle: gpu?.title || ''
    };
  };

  // Fetch shared builds on mount
  useEffect(() => {
    const fetchBuildsData = async () => {
      try {
        setLoading(true);
        const response = await getSharedBuilds();
        if (response) {
          // Pre-parse build specifications for faster filtering & sorting
          const parsedBuilds = response.map(build => ({
            ...build,
            specs: parseBuildSpecs(build)
          }));
          setBuilds(parsedBuilds);

          // Dynamically compute maximum price in data to initialize slider
          if (parsedBuilds.length > 0) {
            const maxPrice = Math.ceil(Math.max(...parsedBuilds.map(b => b.specs.totalPrice)));
            setPriceRange([0, Math.max(maxPrice, 10000)]);
          }
        }
      } catch (err) {
        console.error('Failed to load shared builds:', err);
        setError('Có lỗi xảy ra khi tải danh sách cấu hình. Vui lòng thử lại sau.');
      } finally {
        setLoading(false);
      }
    };

    fetchBuildsData();
  }, []);

  // Compute unique filter lists from original build specs
  const filterOptions = useMemo(() => {
    const cpuNamesSet = new Set();
    const gpuChipsetsSet = new Set();

    builds.forEach(build => {
      if (build.specs.cpuName && build.specs.cpuName !== 'Chưa chọn CPU') {
        // Just extract a cleaner, shorter CPU name if it's too long
        let shortCpu = build.specs.cpuName;
        const amdMatch = shortCpu.match(/AMD Ryzen \d \d{4}X?/i);
        const intelMatch = shortCpu.match(/Intel Core i\d[- ]\d+K?F?/i);
        if (amdMatch) shortCpu = amdMatch[0];
        else if (intelMatch) shortCpu = intelMatch[0];
        else shortCpu = shortCpu.split(' ').slice(0, 3).join(' '); // Default backup fallback

        cpuNamesSet.add(shortCpu);
      }
      if (build.specs.gpuChipset && build.specs.gpuChipset !== 'Chưa chọn GPU') {
        let shortGpu = build.specs.gpuChipset;
        // Clean up chipset names like "GeForce RTX 3060" or "Radeon RX 6600"
        const cleanGpu = shortGpu.split(' ').slice(0, 4).join(' ');
        gpuChipsetsSet.add(cleanGpu);
      }
    });

    return {
      cpuNames: Array.from(cpuNamesSet).sort(),
      gpuChipsets: Array.from(gpuChipsetsSet).sort()
    };
  }, [builds]);

  // Handle filter changes
  const handleFilterChange = (category, value) => {
    setFilters(prev => {
      const list = prev[category];
      const updated = list.includes(value)
        ? list.filter(item => item !== value)
        : [...list, value];
      return { ...prev, [category]: updated };
    });
    setCurrentPage(1);
  };

  // Search filter
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const toggleFilterSection = (section) => {
    setExpandedFilterSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Apply all search, filters & sorting logic
  const filteredBuilds = useMemo(() => {
    let results = [...builds];

    // 1. Search term filter (searches build name, description, cpu name, gpu chipset)
    if (searchTerm) {
      const keywords = searchTerm.toLowerCase().trim().split(/\s+/);
      results = results.filter(build => {
        const buildName = (build.build_name || '').toLowerCase();
        const desc = (build.description || '').toLowerCase();
        const cpu = (build.specs.cpuName || '').toLowerCase();
        const gpu = (build.specs.gpuChipset || '').toLowerCase();

        return keywords.every(word =>
          buildName.includes(word) ||
          desc.includes(word) ||
          cpu.includes(word) ||
          gpu.includes(word)
        );
      });
    }

    // 2. Price filter
    results = results.filter(build =>
      build.specs.totalPrice >= priceRange[0] && build.specs.totalPrice <= priceRange[1]
    );

    // 3. CPU name filter
    if (filters.cpuName.length > 0) {
      results = results.filter(build =>
        filters.cpuName.some(name => build.specs.cpuName.toLowerCase().includes(name.toLowerCase()))
      );
    }

    // 4. GPU chipset filter
    if (filters.gpuChipset.length > 0) {
      results = results.filter(build =>
        filters.gpuChipset.some(chip => build.specs.gpuChipset.toLowerCase().includes(chip.toLowerCase()))
      );
    }

    // 5. Apply sorting
    if (sortOption === 'Price: Low to High') {
      results.sort((a, b) => a.specs.totalPrice - b.specs.totalPrice);
    } else if (sortOption === 'Price: High to Low') {
      results.sort((a, b) => b.specs.totalPrice - a.specs.totalPrice);
    } else if (sortOption === 'Oldest') {
      results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else { // Newest
      results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return results;
  }, [builds, searchTerm, priceRange, filters, sortOption]);

  // Pagination logic
  const totalPages = Math.ceil(filteredBuilds.length / itemsPerPage);
  const currentBuilds = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredBuilds.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredBuilds, currentPage]);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    if (builds.length > 0) {
      const maxPrice = Math.ceil(Math.max(...builds.map(b => b.specs.totalPrice)));
      setPriceRange([0, Math.max(maxPrice, 10000)]);
    } else {
      setPriceRange([0, 10000]);
    }
    setFilters({ cpuName: [], gpuChipset: [] });
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="sb-loader-container">
        <div className="sb-spinner"></div>
        <p>Đang tải danh sách PC build được chia sẻ...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sb-error-container">
        <div className="sb-error-card">
          <h2>Có lỗi xảy ra</h2>
          <p>{error}</p>
          <button className="sb-retry-btn" onClick={() => window.location.reload()}>Tải lại trang</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sb-shared-build-container">
      {/* Page Hero Header */}
      <div className="sb-hero-section">
        <h1>Góc Chia Sẻ PC Builds</h1>
        <p>Khám phá, tùy biến và hiện thực hóa các bộ cấu hình PC đỉnh cao được thiết kế và chia sẻ bởi cộng đồng!</p>
      </div>

      <div className="sb-search-content">
        {/* Left Side Filter Panel */}
        {showFilters && (
          <div className="sb-sidebar">
            <div className="sb-sidebar-header">
              <h3><FaFilter /> Bộ Lọc</h3>
              <button className="sb-reset-all-btn" onClick={resetFilters}>Xóa bộ lọc</button>
            </div>

            {/* Price Filter Section */}
            <div className="sb-filter-section">
              <div
                className="sb-filter-header"
                onClick={() => toggleFilterSection('price')}
              >
                <h3>Khoảng giá</h3>
                {expandedFilterSections.price ? <FaChevronUp /> : <FaChevronDown />}
              </div>
              {expandedFilterSections.price && (
                <div className="sb-filter-body">
                  <div className="sb-price-label">
                    ${priceRange[0].toLocaleString()} - ${priceRange[1].toLocaleString()}
                  </div>
                  <div className="sb-price-range-controls">
                    <div className="sb-price-track"></div>
                    <div
                      className="sb-price-range-selected"
                      style={{
                        left: `${(priceRange[0] / 10000) * 100}%`,
                        right: `${100 - (priceRange[1] / 10000) * 100}%`
                      }}
                    ></div>
                    <input
                      type="range"
                      min="0"
                      max="10000"
                      value={priceRange[0]}
                      onChange={(e) => {
                        const nextMin = Math.min(parseInt(e.target.value), priceRange[1] - 100);
                        setPriceRange([nextMin, priceRange[1]]);
                      }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="10000"
                      value={priceRange[1]}
                      onChange={(e) => {
                        const nextMax = Math.max(parseInt(e.target.value), priceRange[0] + 100);
                        setPriceRange([priceRange[0], nextMax]);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* CPU Model Filter Section */}
            {filterOptions.cpuNames.length > 0 && (
              <div className="sb-filter-section">
                <div
                  className="sb-filter-header"
                  onClick={() => toggleFilterSection('cpuName')}
                >
                  <h3>Vi xử lý (CPU)</h3>
                  {expandedFilterSections.cpuName ? <FaChevronUp /> : <FaChevronDown />}
                </div>
                {expandedFilterSections.cpuName && (
                  <div className="sb-checkbox-group">
                    {filterOptions.cpuNames.map(name => (
                      <label key={name} className="sb-checkbox-label">
                        <input
                          type="checkbox"
                          checked={filters.cpuName.includes(name)}
                          onChange={() => handleFilterChange('cpuName', name)}
                        />
                        <span className="sb-checkmark"></span>
                        <span className="sb-checkbox-text">{name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* GPU Chipset Filter Section */}
            {filterOptions.gpuChipsets.length > 0 && (
              <div className="sb-filter-section">
                <div
                  className="sb-filter-header"
                  onClick={() => toggleFilterSection('gpuChipset')}
                >
                  <h3>Card đồ họa (GPU)</h3>
                  {expandedFilterSections.gpuChipset ? <FaChevronUp /> : <FaChevronDown />}
                </div>
                {expandedFilterSections.gpuChipset && (
                  <div className="sb-checkbox-group">
                    {filterOptions.gpuChipsets.map(chipset => (
                      <label key={chipset} className="sb-checkbox-label">
                        <input
                          type="checkbox"
                          checked={filters.gpuChipset.includes(chipset)}
                          onChange={() => handleFilterChange('gpuChipset', chipset)}
                        />
                        <span className="sb-checkmark"></span>
                        <span className="sb-checkbox-text">{chipset}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right Side Grid Results Section */}
        <div className="sb-results-container">
          <div className="sb-search-header-controls">
            <div className="sb-search-bar-wrapper">
              <FaSearch className="sb-search-icon" />
              <input
                type="text"
                placeholder="Tìm tên cấu hình, CPU, GPU..."
                value={searchTerm}
                onChange={handleSearch}
              />
            </div>

            <div className="sb-right-controls">
              <button className="sb-toggle-filter-btn" onClick={() => setShowFilters(!showFilters)}>
                {showFilters ? 'Ẩn bộ lọc' : 'Hiện bộ lọc'} <FaFilter />
              </button>

              <div className="sb-sort-control">
                <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
                  <option value="Newest">Mới nhất</option>
                  <option value="Oldest">Cũ nhất</option>
                  <option value="Price: Low to High">Giá: Thấp đến Cao</option>
                  <option value="Price: High to Low">Giá: Cao đến Thấp</option>
                </select>
              </div>
            </div>
          </div>

          <div className="sb-results-meta">
            <h2>Tìm thấy {filteredBuilds.length} cấu hình phù hợp</h2>
          </div>

          {currentBuilds.length > 0 ? (
            <div className="sb-builds-grid">
              {currentBuilds.map((build) => (
                <div className="sb-build-card" key={build.id}>
                  {/* Composite 3-Image Container (Case, CPU, GPU) */}
                  <div className="sb-composite-image-wrapper" onClick={() => navigate(`/shared-build/${build.slug}`)}>
                    {/* Left: PC Case (60% width) */}
                    <div className="sb-composite-left">
                      <img
                        src={build.specs.caseImg}
                        alt={build.specs.caseTitle || "PC Case"}
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/300x400?text=No+Case'; }}
                      />
                    </div>
                    {/* Right: CPU and GPU (40% width, stacked vertically) */}
                    <div className="sb-composite-right">
                      <div className="sb-composite-right-top">
                        <img
                          src={build.specs.cpuImg}
                          alt={build.specs.cpuTitle || "CPU"}
                          onError={(e) => { e.target.src = 'https://via.placeholder.com/150x150?text=No+CPU'; }}
                        />
                      </div>
                      <div className="sb-composite-right-bottom">
                        <img
                          src={build.specs.gpuImg}
                          alt={build.specs.gpuTitle || "GPU"}
                          onError={(e) => { e.target.src = 'https://via.placeholder.com/150x150?text=No+GPU'; }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Build card description / body */}
                  <div className="sb-build-details">
                    <h3 className="sb-build-title" title={build.build_name} onClick={() => navigate(`/shared-build/${build.slug}`)}>
                      {build.build_name}
                    </h3>


                    {/* Creator and Date */}
                    <div className="sb-build-author-row">
                      <span className="sb-author">
                        <FaUser className="sb-icon-small" /> {build.creator_name || 'Cộng đồng'}
                      </span>
                      <span className="sb-date">
                        <FaCalendarAlt className="sb-icon-small" /> {new Date(build.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    {/* Specifications List */}
                    <div className="sb-build-specs-list">
                      <div className="sb-spec-item" title={build.specs.cpuName}>
                        <FaMicrochip className="sb-spec-icon" />
                        <div className="sb-spec-info">
                          <span className="sb-spec-label">CPU</span>
                          <span className="sb-spec-val">{build.specs.cpuName}</span>
                        </div>
                      </div>

                      <div className="sb-spec-item" title={build.specs.gpuChipset}>
                        <FaVideo className="sb-spec-icon" />
                        <div className="sb-spec-info">
                          <span className="sb-spec-label">VGA</span>
                          <span className="sb-spec-val">{build.specs.gpuChipset}</span>
                        </div>
                      </div>

                      <div className="sb-spec-item" title={build.specs.ramText}>
                        <FaMemory className="sb-spec-icon" />
                        <div className="sb-spec-info">
                          <span className="sb-spec-label">RAM</span>
                          <span className="sb-spec-val">{build.specs.ramText}</span>
                        </div>
                      </div>

                      <div className="sb-spec-item" title={build.specs.storageText}>
                        <FaHdd className="sb-spec-icon" />
                        <div className="sb-spec-info">
                          <span className="sb-spec-label">Storage</span>
                          <span className="sb-spec-val">{build.specs.storageText}</span>
                        </div>
                      </div>
                    </div>

                    {/* Price and Action Button Row */}
                    <div className="sb-build-card-footer">
                      <div className="sb-price-block">
                        <span className="sb-price-label-total">Tổng tiền</span>
                        <div className="sb-price-value">
                          <FaDollarSign className="sb-price-currency-icon" />
                          <span>{build.specs.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      <button
                        className="sb-use-config-btn"
                        onClick={() => navigate(`/build/${build.slug}`)}
                      >
                        <FaTools /> Sử dụng
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sb-no-results">
              <p>Không tìm thấy cấu hình PC nào phù hợp với bộ lọc hiện tại. Hãy thử điều chỉnh lại bộ lọc hoặc tìm kiếm.</p>
              <button className="sb-reset-filters-btn" onClick={resetFilters}>Làm mới tìm kiếm</button>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="sb-pagination">
              <button
                className="sb-page-btn"
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
              >
                Trang trước
              </button>
              <span className="sb-page-info">Trang {currentPage} / {totalPages}</span>
              <button
                className="sb-page-btn"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
              >
                Trang sau
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SharedBuild;
