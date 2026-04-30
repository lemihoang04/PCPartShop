import React, { useState, useEffect } from 'react';
import { fetchLaptops } from '../../services/laptopService';
import './LaptopSearch.css';
import { useNavigate } from 'react-router-dom';
import { FaSearch, FaFilter, FaStar, FaChevronDown, FaChevronUp } from 'react-icons/fa';

const LaptopSearch = () => {
  const [laptops, setLaptops] = useState([]);
  const [priceRange, setPriceRange] = useState([15, 10000]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [showFilters, setShowFilters] = useState(true);
  const [sortOption, setSortOption] = useState('None');
  const [expandedFilterSections, setExpandedFilterSections] = useState({
    screenSize: false,
    price: true,
    ramSize: false,
    brand: false,
    cpuManufacturer: false,
    weight: false,
    processorType: false,
    operatingSystem: false,
    graphicsCoprocessor: false,
    storageType: false,
    storageCapacity: false
  });

  // Filter states
  const [filters, setFilters] = useState({
    screenSize: [],
    ramSize: [],
    brand: [],
    cpuManufacturer: [],
    weight: [],
    processorType: [],
    operatingSystem: [],
    graphicsCoprocessor: [],
    storageType: [],
    storageCapacity: []
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filteredLaptops, setFilteredLaptops] = useState([]);
  const [availableBrands, setAvailableBrands] = useState([]);
  const [showAllBrands, setShowAllBrands] = useState(false);

  const navigate = useNavigate();

  // Apply all filters to laptops
  useEffect(() => {
    let results = [...laptops];    // Apply search term filter
     if (searchTerm) {
    const keywords = searchTerm
      .toLowerCase()
      .trim()
      .split(/\s+/);

    results = results.filter((laptop) => {
      const title = laptop.title.toLowerCase();

      return keywords.every((word) =>
        title.includes(word)
      );
    });
  }

    // Apply price range filter
    results = results.filter(laptop => {
      // If price is missing or invalid, show the laptop anyway (don't filter it out)
      if (laptop.price === undefined || laptop.price === null || isNaN(laptop.price)) {
        // Keep laptops with missing price info (just for display purposes)
        console.log('Laptop with missing price:', laptop);
        return true;
      }
      // Otherwise filter by price range as normal
      return laptop.price >= priceRange[0] && laptop.price <= priceRange[1];
    });

    // Apply screen size filter
    if (filters.screenSize.length > 0) {
      results = results.filter(laptop => {
        if (!laptop.screen_size) return false;
        const screenSize = parseFloat(laptop.screen_size);

        return filters.screenSize.some(size => {
          if (size === "17 inches & Above" && screenSize >= 17) return true;
          if (size === "16 to 16.9 inches" && screenSize >= 16 && screenSize < 17) return true;
          if (size === "15 to 15.9 inches" && screenSize >= 15 && screenSize < 16) return true;
          if (size === "14 to 14.9 inches" && screenSize >= 14 && screenSize < 15) return true;
          if (size === "13 to 13.9 inches" && screenSize >= 13 && screenSize < 14) return true;
          if (size === "12 to 12.9 inches" && screenSize >= 12 && screenSize < 13) return true;
          if (size === "11 to 11.9 inches" && screenSize >= 11 && screenSize < 12) return true;
          if (size === "11 inches & Under" && screenSize < 11) return true;
          return false;
        });
      });
    }

    // Apply RAM filter
    if (filters.ramSize.length > 0) {
      results = results.filter(laptop =>
        filters.ramSize.some(size => laptop.ram && laptop.ram.includes(size))
      );
    }    // Apply storage type filter
    if (filters.storageType.length > 0) {
      results = results.filter(laptop => {
        // Check both old property (hard_drive) and new property (storage_type)
        const storageInfo = laptop.storage_type || laptop.hard_drive || '';
        if (!storageInfo) return false;

        return filters.storageType.some(type =>
          (type === "SSD" && storageInfo.toUpperCase().includes("SSD")) ||
          (type === "HDD" && storageInfo.toUpperCase().includes("HDD")) ||
          (type === "eMMC" && storageInfo.toLowerCase().includes("emmc"))
        );
      });
    }

    // Apply storage capacity filter
    if (filters.storageCapacity.length > 0) {
      results = results.filter(laptop => {
        // Check both old property (hard_drive) and new property (storage_capacity)
        const capacityInfo = laptop.storage_capacity || laptop.hard_drive || '';
        if (!capacityInfo) return false;

        // Extract the capacity part (e.g. "128 GB" from "128 GB SSD")
        const capacityMatch = capacityInfo.match(/(\d+)\s*(TB|GB|MB)/i);
        if (!capacityMatch) return false;

        const capacity = capacityMatch[0].trim();
        return filters.storageCapacity.some(cap => capacity.includes(cap));
      });
    }

    // Apply brand filter
    if (filters.brand.length > 0) {
      results = results.filter(laptop =>
        filters.brand.includes(laptop.brand)
      );
    }    // Apply CPU manufacturer filter
    if (filters.cpuManufacturer.length > 0) {
      results = results.filter(laptop => {
        // Check both old and new property names
        const cpuInfo = laptop.cpuManufacturer || laptop.chipset_brand || laptop.processor_type || '';
        return filters.cpuManufacturer.some(manufacturer =>
          cpuInfo.includes(manufacturer)
        );
      });
    }

    // Apply weight filter
    if (filters.weight.length > 0) {
      results = results.filter(laptop => {
        // Check both old and new property names
        const weightInfo = laptop.weight || laptop.item_weight || '';
        if (!weightInfo) return false;

        // Try to extract a number from the weight string
        const weightMatch = weightInfo.match(/(\d+(\.\d+)?)/);
        if (!weightMatch) return false;

        const weight = parseFloat(weightMatch[0]);

        return filters.weight.some(weightRange => {
          if (weightRange === "Up to 3 Pounds" && weight <= 3) return true;
          if (weightRange === "3 to 3.9 Pounds" && weight > 3 && weight < 4) return true;
          if (weightRange === "4 to 4.9 Pounds" && weight >= 4 && weight < 5) return true;
          if (weightRange === "5 to 5.9 Pounds" && weight >= 5 && weight < 6) return true;
          if (weightRange === "6 to 6.9 Pounds" && weight >= 6 && weight < 7) return true;
          if (weightRange === "7 to 7.9 Pounds" && weight >= 7 && weight < 8) return true;
          return false;
        });
      });
    }

    // Apply OS filter
    if (filters.operatingSystem.length > 0) {
      results = results.filter(laptop =>
        filters.operatingSystem.some(os => laptop.operating_system && laptop.operating_system.includes(os))
      );
    }

    // Apply processor type filter
    if (filters.processorType.length > 0) {
      results = results.filter(laptop =>
        filters.processorType.some(processor => laptop.processor_type && laptop.processor_type.includes(processor))
      );
    }    // Apply graphics filter
    if (filters.graphicsCoprocessor.length > 0) {
      results = results.filter(laptop =>
        filters.graphicsCoprocessor.some(gpu => laptop.graphics_coprocessor && laptop.graphics_coprocessor.includes(gpu))
      );
    }

    // Apply sort after filtering
    results = applySorting(results);

    setFilteredLaptops(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laptops, filters, priceRange, searchTerm, sortOption]);

  // Extract the sorting logic into a separate function
  const applySorting = (laptopList) => {
    let sortedLaptops = [...laptopList];

    switch (sortOption) {
      case 'None':
        break;
      case 'Price: Low to High':
        sortedLaptops.sort((a, b) => a.price - b.price);
        break;
      case 'Price: High to Low':
        sortedLaptops.sort((a, b) => b.price - a.price);
        break;
      case 'Rating: High to Low':
        sortedLaptops.sort((a, b) => b.rating - a.rating);
        break;
      case 'Newest Arrivals':
        // Assuming there's a date field, otherwise this will need modification
        sortedLaptops.sort((a, b) => new Date(b.release_date || 0) - new Date(a.release_date || 0));
        break;
      default:
        break;
    }

    return sortedLaptops;
  };

  // Handle checkbox change for filters
  const handleFilterChange = (category, value) => {
    setFilters(prevFilters => {
      const updatedFilters = { ...prevFilters };
      if (updatedFilters[category].includes(value)) {
        // Remove the value if it's already in the array
        updatedFilters[category] = updatedFilters[category].filter(item => item !== value);
      } else {
        // Add the value if it's not in the array
        updatedFilters[category] = [...updatedFilters[category], value];
      }
      return updatedFilters;
    });
    setCurrentPage(1); // Reset to first page when filter changes
  };
  // Apply price filter - Not currently used
  // const applyPriceFilter = () => {
  //   setCurrentPage(1); // Reset to first page when price filter is applied
  // };

  const handleSearch = (e) => {
    const term = e.target.value.toLowerCase();
    setSearchTerm(term);
    setCurrentPage(1); // Reset to first page when search changes
  };  // Function to scroll to top of products list
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Scroll to top when page changes
  useEffect(() => {
    scrollToTop();
  }, [currentPage]);

  const toggleShowAllBrands = () => {
    setShowAllBrands(!showAllBrands);
  };

  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  const handleSortChange = (e) => {
    setSortOption(e.target.value);
  };

  const toggleFilterSection = (section) => {
    setExpandedFilterSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Pagination
  const displayLaptops = filteredLaptops;
  const totalPages = Math.ceil(displayLaptops.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLaptops = displayLaptops.slice(indexOfFirstItem, indexOfLastItem);

  // Extract unique brands from laptops
  useEffect(() => {
    if (laptops.length > 0) {
      const brands = [...new Set(laptops.map(laptop => laptop.brand).filter(Boolean))];
      setAvailableBrands(brands);
    }
  }, [laptops]);

  useEffect(() => {
    const loadLaptops = async () => {
      const data = await fetchLaptops();
      console.log('Fetched laptops data:', data);
      if (data && Array.isArray(data)) {
        // Add a format step to ensure all laptops have consistent data structure
        const formattedLaptops = data.map(laptop => ({
          ...laptop,
          // Ensure these fields exist even if backend didn't provide them
          brand: laptop.brand || '',
          screen_size: laptop.screen_size || '',
          ram: laptop.ram || '',
          processor_type: laptop.processor_type || '',
          storage_type: laptop.storage_type || '',
          storage_capacity: laptop.storage_capacity || '',
          // Set price to null if it's invalid so our filter can identify it
          price: laptop.price !== undefined ?
            (isNaN(parseFloat(laptop.price)) ? null : parseFloat(laptop.price)) :
            null
        }));

        setLaptops(formattedLaptops);
        setFilteredLaptops(formattedLaptops);
        console.log('Formatted laptops data:', formattedLaptops);
      }
    };
    loadLaptops();
  }, []);

  // Render filter section
  const renderFilterSection = (title, section, items, showAll = null, toggleShowAll = null) => {
    return (
      <div className="ls-filter-section">
        <div
          className="ls-filter-header"
          onClick={() => toggleFilterSection(section)}
        >
          <h3>{title}</h3>
          {expandedFilterSections[section] ? <FaChevronUp /> : <FaChevronDown />}
        </div>        {expandedFilterSections[section] && (
          <div className="ls-checkbox-group">
            {items}
            {showAll !== null && section === "brand" && availableBrands.length > 5 && (
              <div className="ls-see-more" onClick={toggleShowAll}>
                <span>{showAll ? "See less" : "See more"}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ls-laptop-search-container">
      <div className="ls-search-content">
        {showFilters && (
          <div className="ls-sidebar">
            {renderFilterSection("Display Size", "screenSize", (
              <>
                {[
                  "17 inches & Above",
                  "16 to 16.9 inches",
                  "15 to 15.9 inches",
                  "14 to 14.9 inches",
                  "13 to 13.9 inches",
                  "12 to 12.9 inches",
                  "11 to 11.9 inches",
                  "11 inches & Under"
                ].map(size => (
                  <label key={size}>
                    <input
                      type="checkbox"
                      checked={filters.screenSize.includes(size)}
                      onChange={() => handleFilterChange("screenSize", size)}
                    />
                    <span className="ls-checkmark"></span>
                    {size}
                  </label>
                ))}
              </>
            ))}

            {renderFilterSection("Price", "price", (
              <>
                <div className="ls-price-label">${priceRange[0]} - ${priceRange[1].toLocaleString()}</div>
                <div className="ls-price-range-controls">
                  <div className="ls-price-track"></div>
                  <div
                    className="ls-price-range-selected"
                    style={{
                      left: `${(priceRange[0] / 10000) * 100}%`,
                      right: `${100 - (priceRange[1] / 10000) * 100}%`
                    }}
                  ></div>
                  <input
                    type="range"
                    min="15"
                    max="10000"
                    value={priceRange[0]}
                    onChange={(e) => {
                      const newMin = Math.min(parseInt(e.target.value), priceRange[1] - 1);
                      setPriceRange([newMin, priceRange[1]]);
                    }}
                  />
                  <input
                    type="range"
                    min="15"
                    max="10000"
                    value={priceRange[1]}
                    onChange={(e) => {
                      const newMax = Math.max(parseInt(e.target.value), priceRange[0] + 1);
                      setPriceRange([priceRange[0], newMax]);
                    }}
                  />
                </div>
                {/* <div className="ls-price-controls">
                  <button className="ls-go-button" onClick={applyPriceFilter}>Apply</button>
                </div> */}
              </>
            ))}

            {renderFilterSection("RAM Size", "ramSize", (
              <>
                {["128 GB", "64 GB", "32 GB", "16 GB", "8 GB", "4 GB"].map(size => (
                  <label key={size}>
                    <input
                      type="checkbox"
                      checked={filters.ramSize.includes(size)}
                      onChange={() => handleFilterChange("ramSize", size)}
                    />
                    <span className="ls-checkmark"></span>
                    {size}
                  </label>
                ))}
              </>
            ))}

            {renderFilterSection("Storage Type", "storageType", (
              <>
                {["SSD", "HDD", "eMMC"].map(type => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      checked={filters.storageType.includes(type)}
                      onChange={() => handleFilterChange("storageType", type)}
                    />
                    <span className="ls-checkmark"></span>
                    {type}
                  </label>
                ))}
              </>
            ))}

            {renderFilterSection("Storage Capacity", "storageCapacity", (
              <>
                {["2 TB", "1 TB", "512 GB", "256 GB", "128 GB", "64 GB"].map(capacity => (
                  <label key={capacity}>
                    <input
                      type="checkbox"
                      checked={filters.storageCapacity.includes(capacity)}
                      onChange={() => handleFilterChange("storageCapacity", capacity)}
                    />
                    <span className="ls-checkmark"></span>
                    {capacity}
                  </label>
                ))}
              </>
            ))}

            {renderFilterSection("Brands", "brand", (
              <>
                {availableBrands
                  .slice(0, showAllBrands ? availableBrands.length : 5)
                  .map(brand => (
                    <label key={brand}>
                      <input
                        type="checkbox"
                        checked={filters.brand.includes(brand)}
                        onChange={() => handleFilterChange("brand", brand)}
                      />
                      <span className="ls-checkmark"></span>
                      {brand}
                    </label>
                  ))
                }
              </>
            ), showAllBrands, toggleShowAllBrands)}

            {renderFilterSection("CPU Model Manufacturer", "cpuManufacturer", (
              <>
                {["Intel", "AMD", "Apple", "Qualcomm"].map(manufacturer => (
                  <label key={manufacturer}>
                    <input
                      type="checkbox"
                      checked={filters.cpuManufacturer.includes(manufacturer)}
                      onChange={() => handleFilterChange("cpuManufacturer", manufacturer)}
                    />
                    <span className="ls-checkmark"></span>
                    {manufacturer}
                  </label>
                ))}
              </>
            ))}

            {/* Remaining filter sections follow the same pattern */}
            {renderFilterSection("Weight", "weight", (
              <>
                {[

                  "Up to 3 Pounds",
                  "3 to 3.9 Pounds",
                  "4 to 4.9 Pounds",
                  "5 to 5.9 Pounds",
                  "6 to 6.9 Pounds",
                  "7 to 7.9 Pounds"
                ].map(weightRange => (
                  <label key={weightRange}>
                    <input
                      type="checkbox"
                      checked={filters.weight.includes(weightRange)}
                      onChange={() => handleFilterChange("weight", weightRange)}
                    />
                    <span className="ls-checkmark"></span>
                    {weightRange}
                  </label>
                ))}

              </>
            ))}

            {renderFilterSection("Processor Type", "processorType", (
              <>
                {[

                  "AMD A-Series",
                  "AMD A10",
                  "AMD A4",
                  "AMD A6",
                  "AMD A8",
                  "Intel Core i3",
                  "Intel Core i5",
                  "Intel Core i7",
                  "Intel Core i9",
                  "Intel Celeron",
                  "Intel Pentium"
                ].map(processor => (
                  <label key={processor}>
                    <input
                      type="checkbox"
                      checked={filters.processorType.includes(processor)}
                      onChange={() => handleFilterChange("processorType", processor)}
                    />
                    <span className="ls-checkmark"></span>
                    {processor}
                  </label>
                ))}

              </>
            ))}

            {renderFilterSection("Operating System", "operatingSystem", (
              <>
                {[

                  "Windows 11 Home",
                  "Windows 11 Pro",
                  "Windows 11 S mode",
                  "Windows 10 Home",
                  "Windows 10 Pro",
                  "macOS",
                  "Chrome OS",
                  "Linux"
                ].map(os => (
                  <label key={os}>
                    <input
                      type="checkbox"
                      checked={filters.operatingSystem.includes(os)}
                      onChange={() => handleFilterChange("operatingSystem", os)}
                    />
                    <span className="ls-checkmark"></span>
                    {os}
                  </label>
                ))}

              </>
            ))}

            {renderFilterSection("Graphics Coprocessor", "graphicsCoprocessor", (
              <>
                {[
                  "NVIDIA GeForce RTX",
                  "NVIDIA GeForce GTX",
                  "Intel UHD Graphics",
                  "Intel Iris Xe Graphics",
                  // "NVIDIA GeForce RTX 2060",
                  // "NVIDIA GeForce RTX 2070",
                  // "NVIDIA GeForce GTX 1650",
                  // "NVIDIA GeForce RTX 2080",
                  // "NVIDIA GeForce RTX 3050 Ti",
                  // "NVIDIA GeForce RTX 3070",
                  // "AMD Radeon Graphics",
                  // "Intel UHD Graphics",
                  // "NVIDIA GeForce RTX 3060"
                ].map(gpu => (
                  <label key={gpu}>
                    <input
                      type="checkbox"
                      checked={filters.graphicsCoprocessor.includes(gpu)}
                      onChange={() => handleFilterChange("graphicsCoprocessor", gpu)}
                    />
                    <span className="ls-checkmark"></span>
                    {gpu}
                  </label>
                ))}

              </>
            ))}

          </div>
        )}

        <div className="ls-results-container">
          <div className="ls-search-header">
            <div className="ls-search-controls">
              <div className="ls-search-bar">
                <FaSearch className="ls-search-icon" />
                <input
                  type="text"
                  placeholder="Search for laptops..."
                  value={searchTerm}
                  onChange={handleSearch}
                />
              </div>
              <div className="ls-filters-control">
                <button className="ls-hide-filters-btn" onClick={toggleFilters}>
                  {showFilters ? 'Hide Filters' : 'Show Filters'}
                  <FaFilter className="ls-filter-icon" />
                </button>
              </div>
            </div>

            <div className="ls-results-header">
              <div className="ls-results-count">
                <h2>{displayLaptops.length} Laptops Found</h2>
              </div>
              <div className="ls-sort-controls">
                <label>Sort by: </label>
                <select value={sortOption} onChange={handleSortChange}>
                  <option value="None">None</option>
                  <option value="Price: Low to High">Price: Low to High</option>
                  <option value="Price: High to Low">Price: High to Low</option>
                  <option value="Rating: High to Low">Rating: High to Low</option>
                  <option value="Newest Arrivals">Newest Arrivals</option>
                </select>
              </div>
            </div>
          </div>
          <div className="ls-laptop-listings">
            {currentLaptops.length > 0 ? (
              currentLaptops.map((laptop) => (
                <div className="ls-laptop-card" key={laptop.id}>
                  <div className="ls-laptop-image" onClick={() => navigate(`/product-info/${laptop.id}`)}>
                    <img
                      src={laptop.image ? laptop.image.split("; ")[0] : "/images/default-laptop.jpg"}
                      alt={laptop.title}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/images/default-laptop.jpg";
                      }}
                    />
                  </div>

                  <div className="ls-laptop-details">
                    <h3
                      className="ls-laptop-title"
                      title={laptop.title}
                      onClick={() => navigate(`/product-info/${laptop.id}`)}
                    >
                      {laptop.title}
                    </h3>

                    <div className="ls-laptop-meta">
                      <div className="ls-rating">
                        <div className="ls-stars">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <FaStar
                              key={star}
                              className={star <= Math.round(laptop.rating) ? "ls-star ls-filled" : "ls-star"}
                            />
                          ))}
                        </div>
                        <span className="ls-rating-count">{laptop.rating}</span>
                      </div>

                      <div className="ls-laptop-price">
                        <div className="ls-current-price">
                          <span className="ls-currency">$</span>
                          <span className="ls-amount">
                            {typeof laptop.price === 'number'
                              ? laptop.price.toFixed(2)
                              : laptop.price || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="ls-laptop-specs">
                      {laptop.screen_size && (
                        <div className="ls-spec">
                          <div className="ls-spec-label">Display</div>
                          <div className="ls-spec-value">{laptop.screen_size}</div>
                        </div>
                      )}

                      {laptop.item_weight && (
                        <div className="ls-spec">
                          <div className="ls-spec-label">Weight</div>
                          <div className="ls-spec-value">{laptop.item_weight}</div>
                        </div>
                      )}

                      {laptop.ram && (
                        <div className="ls-spec">
                          <div className="ls-spec-label">RAM</div>
                          <div className="ls-spec-value">{laptop.ram}</div>
                        </div>
                      )}

                      {laptop.hard_drive && (
                        <div className="ls-spec">
                          <div className="ls-spec-label">Storage</div>
                          <div className="ls-spec-value">{laptop.hard_drive}</div>
                        </div>
                      )}
                    </div>

                    <div className="ls-laptop-actions">
                      <button
                        className="ls-view-details-btn"
                        onClick={() => navigate(`/product-info/${laptop.id}`)}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="ls-no-results">
                <p>No laptops found matching your criteria. Try adjusting your filters.</p>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="ls-pagination">
              <button
                className="ls-page-btn ls-prev-btn"
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
              >
                Previous
              </button>

              <div className="ls-page-info">
                <span>Page {currentPage} of {totalPages}</span>
              </div>

              <button
                className="ls-page-btn ls-next-btn"
                onClick={handleNextPage}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LaptopSearch;