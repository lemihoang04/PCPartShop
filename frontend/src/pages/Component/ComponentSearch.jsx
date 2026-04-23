import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchCompatibleCPUs, fetchCompatibleCpuCoolers, fetchCompatibleMainboards, fetchComponents, fetchCompatibleRam, fetchCompatibleStorage, fetchCompatibleCases, fetchCompatiblePSU } from '../../services/componentService';
import './ComponentSearch.css';
import { fetchComponentById } from '../../services/componentService';

const ComponentSearch = () => {
  const { type } = useParams();
  const [components, setComponents] = useState([]);
  const [filteredComponents, setFilteredComponents] = useState([]);
  const [priceRange, setPriceRange] = useState([0, 5000]);
  const [manufacturerFilter, setManufacturerFilter] = useState({
    AMD: true,
    Intel: false,
    Nvidia: false,
    'Western Digital': false,
    Samsung: false,
    Corsair: false,
    ASUS: false,
    MSI: false,
    Gigabyte: false,
  }); const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFilterVisible, setIsFilterVisible] = useState(true);
  const [showAllManufacturers, setShowAllManufacturers] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'Price', direction: 'asc' });
  const navigate = useNavigate();

  const validTypes = ['Storage', 'PSU', 'Mainboard', 'GPU', 'CPU', 'RAM', 'CPU Cooler', 'Case'];

  const normalizeType = (inputType) => {
    if (!inputType) return null;
    const lowerType = inputType.toLowerCase();
    return validTypes.find((validType) => validType.toLowerCase() === lowerType) || null;
  };

  const normalizedType = normalizeType(type);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);


  // useEffect(() => {
  //   const loadComponents = async () => {
  //     try {
  //       setError(null);

  //       // Trích xuất query params từ URL
  //       const searchParams = new URLSearchParams(window.location.search);
  //       const queryFilters = {};

  //       // Convert query params thành object filters
  //       for (const [key, value] of searchParams.entries()) {
  //         if (key !== 'type') { // Bỏ qua tham số 'type' nếu có
  //           queryFilters[key] = value;
  //         }
  //       }

  //       console.log('Filtering components with:', queryFilters);

  //       // Gọi API với các bộ lọc từ URL
  //       const data = await fetchComponents(normalizedType, queryFilters);

  //       // Kiểm tra lỗi từ API
  //       if (!data || data.error) {
  //         setError(data?.error || 'Failed to load components');
  //         setComponents([]);
  //         setFilteredComponents([]);
  //         return;
  //       }

  //       // Đảm bảo data là một mảng
  //       if (!Array.isArray(data)) {
  //         setError('Invalid data format from server');
  //         return;
  //       }

  //       // Xử lý dữ liệu components
  //       const parsedComponents = data.map((component) => {
  //         // Xử lý trường hợp attributes đã được format dưới dạng object từ server
  //         let attributes = component.attributes || {};

  //         // Nếu attributes là string, chuyển đổi nó thành object
  //         if (typeof component.attributes === 'string') {
  //           try {
  //             attributes = Object.fromEntries(
  //               component.attributes.split(',').map((attr) => {
  //                 const [name, value] = attr.split(':').map((s) => s?.trim() || '');
  //                 return [name, value];
  //               })
  //             );
  //           } catch (err) {
  //             console.error(`Error parsing attributes for component:`, component, err);
  //           }
  //         }

  //         // Đảm bảo giá tiền là số
  //         const parsedPrice = parseFloat(component.price) || 0;

  //         return { 
  //           ...component, 
  //           price: parsedPrice, 
  //           attributes 
  //         };
  //       });

  //       setComponents(parsedComponents);
  //       setFilteredComponents(parsedComponents);
  //     } catch (err) {
  //       console.error('Error loading components:', err);
  //       setError('Failed to load components');
  //     }
  //   };

  //   if (normalizedType) {
  //     loadComponents();
  //   }
  // }, [normalizedType, window.location.search]); // Thêm location.search vào dependencies để reload khi query params thay đổi

  // Line 97: Add this at the end of the useEffect function to actually call loadComponents

  const loadComponents = async () => {
    try {
      setError(null);

      // Trích xuất query params từ URL
      const searchParams = new URLSearchParams(window.location.search);
      const queryFilters = {};
      let cpuSocket = null;
      let memory_type = null;
      let form_factor = null;
      let totalWattage = null;
      // Chuyển đổi query params thành bộ lọc
      for (const [key, value] of searchParams.entries()) {
        if (key === 'cpu_socket') {

          cpuSocket = value;
          console.log(`CPU Socket filter applied: ${cpuSocket}`);
        }
        else if (key === 'memory_type') {
          memory_type = value;
        }
        else if (key === 'form_factor') {
          form_factor = value;
        }
        else if (key === 'wattage') {
          totalWattage = value;
        }
        else if (key !== 'type') { // Bỏ qua tham số 'type' nếu có
          queryFilters[key] = value;
        }

      }

      console.log('Filtering components with:', queryFilters);

      let data;

      // Sử dụng API phù hợp dựa trên loại component và socket CPU
      if (normalizedType === 'CPU' && cpuSocket) {
        console.log(`Fetching compatible CPUs for socket: ${cpuSocket}`);
        data = await fetchCompatibleCPUs(cpuSocket);
      }
      else if (normalizedType === 'CPU Cooler' && cpuSocket) {
        data = await fetchCompatibleCpuCoolers(cpuSocket);
      }
      else if (normalizedType === 'Mainboard' && cpuSocket) {
        console.log(`Fetching compatible Mainboard for socket: ${cpuSocket}`);
        data = await fetchCompatibleMainboards(cpuSocket);
      }
      else if (normalizedType === 'RAM' && memory_type) {
        console.log(`Fetching compatible RAM for memory type: ${memory_type}`);
        data = await fetchCompatibleRam(memory_type);
      }
      else if (normalizedType === 'Storage') {
        data = await fetchCompatibleStorage();
      }
      else if (normalizedType === 'Case' && form_factor) {
        console.log(`Fetching compatible Cases for form factor: ${form_factor}`);
        data = await fetchCompatibleCases(form_factor);
      }
      else if (normalizedType === 'PSU' && totalWattage) {
        console.log(`Fetching compatible PSU for total wattage: ${totalWattage}`);
        data = await fetchCompatiblePSU(totalWattage);
      }
      else {
        // Sử dụng API lấy component thông thường
        data = await fetchComponents(normalizedType, queryFilters);
      }

      // Kiểm tra lỗi từ API
      if (!data || data.error) {
        setError(data?.error || 'Failed to load components');
        setComponents([]);
        setFilteredComponents([]);
        return;
      }

      // Đảm bảo data là một mảng
      if (!Array.isArray(data)) {
        setError('Invalid data format from server');
        return;
      }

      // Xử lý dữ liệu component với các chuyển đổi phù hợp
      const parsedComponents = data.map((component) => {
        // Xử lý thuộc tính
        let attributes = component.attributes || {};

        // Nếu attributes là một chuỗi, chuyển nó thành đối tượng
        if (typeof component.attributes === 'string') {
          try {
            attributes = Object.fromEntries(
              component.attributes.split(',').map((attr) => {
                const [name, value] = attr.split(':').map((s) => s?.trim() || '');
                return [name, value];
              })
            );
          } catch (err) {
            console.error(`Error parsing attributes for component:`, component, err);
          }
        }

        // Đảm bảo giá là một số
        const parsedPrice = parseFloat(component.price) || 0;

        return {
          ...component,
          price: parsedPrice,
          attributes
        };
      });

      setComponents(parsedComponents);
      setFilteredComponents(parsedComponents);
    } catch (err) {
      console.error('Error loading components:', err);
      setError('Failed to load components');
    }
  };
  useEffect(() => {
    // Inside the loadComponents async function in the useEffect
    // Actually call the function to load components
    loadComponents();

  }, [normalizedType, window.location.search]); // Thêm location.search vào dependencies để reload khi query params thay đổi

  const itemsPerPage = 50;
  const getRawComponentHeaders = () => {
    const headers = {
      CPU: [
        'Name',
        'Core Count',
        'Core Clock',
        'Core Boost Clock',
        'Socket',
        'TDP',
        'Integrated Graphics',
        'Rating',
        'Price',
        'Action'
      ],
      RAM: [
        'Name',
        'Speed',
        'Modules',
        'CAS Latency',
        'Voltage',
        'Timing',
        'ECC / Registered',
        'Price',
        'Action'
      ],
      'CPU Cooler': [
        'Name',
        'Fan RPM',
        'Noise Level',
        'Height',
        'CPU Socket',
        'Water Cooled',
        'Fanless',
        'Price',
        'Action'
      ],
      Case: [
        'Name',
        'Type',
        'Color',
        'Side Panel',
        'Motherboard Form Factor',
        'Maximum Video Card Length',
        'Drive Bays',
        'Price',
        'Action'
      ],
      GPU: [
        'Name',
        'Chipset',
        'Memory',
        'Core Clock',
        'Boost Clock',
        'TDP',
        'Cooling',
        'Interface',
        'Price',
        'Action'
      ],
      Mainboard: [
        'Name',
        'Socket/CPU',
        'Form Factor',
        'Chipset',
        'Memory Max',
        'Memory Slots',
        'PCIe x16 Slots',
        'Price',
        'Action'
      ],
      PSU: [
        'Name',
        'Wattage',
        'Efficiency Rating',
        'Modular',
        'ATX 4-Pin Connectors',
        'PCIe 8-Pin Connectors',
        'SATA Connectors',
        'Price',
        'Action'
      ],
      Storage: [
        'Name',
        'Capacity',
        'Type',
        'Form Factor',
        'Interface',
        'NVME',
        'Cache',
        'Price',
        'Action'
      ],
    };

    return headers[normalizedType] || ['Name', 'Price'];
  };

  const getSortableValue = (component, key) => {
    if (key === 'Name') return component.title || '';
    if (key === 'Price') return Number(component.price) || 0;
    if (key === 'Rating') return Number(component.attributes?.['Rating Count']) || 0;

    const value = component.attributes?.[key];
    if (value === undefined || value === null || value === 'N/A') return '';

    if (typeof value === 'number') return value;

    const asString = String(value).trim();
    const numeric = parseFloat(asString.replace(/[^\d.-]/g, ''));

    return Number.isNaN(numeric) ? asString.toLowerCase() : numeric;
  };

  const sortedComponents = useMemo(() => {
    const sortable = [...filteredComponents];

    sortable.sort((a, b) => {
      const aValue = getSortableValue(a, sortConfig.key);
      const bValue = getSortableValue(b, sortConfig.key);

      if (aValue === bValue) return 0;

      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      }

      return aValue < bValue ? 1 : -1;
    });

    return sortable;
  }, [filteredComponents, sortConfig]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentComponents = sortedComponents.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedComponents.length / itemsPerPage);

  const handleSort = (key) => {
    if (!key || key === 'Action') return;

    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }

      return { key, direction: 'asc' };
    });
  };

  const handleSearch = (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = components.filter((component) =>
      component.title?.toLowerCase().includes(term)
    );
    setFilteredComponents(filtered);
    setCurrentPage(1);
  }; const handlePriceFilter = () => {
    // Lọc các component trong khoảng giá đã chọn
    const filtered = components.filter(
      (component) => {
        // Đảm bảo component có giá hợp lệ
        if (component.price === undefined || component.price === null) {
          return false;
        }

        // Chuyển đổi giá thành số nếu cần
        const price = typeof component.price === 'number'
          ? component.price
          : parseFloat(component.price);

        // Kiểm tra xem giá có hợp lệ không (là một số)
        if (isNaN(price)) {
          return false;
        }

        // Kiểm tra xem giá có nằm trong khoảng không
        return price >= priceRange[0] && price <= priceRange[1];
      }
    );

    console.log(`Price filter applied: $${priceRange[0]} - $${priceRange[1]}`);
    console.log(`Filtered from ${components.length} to ${filtered.length} components`);

    setFilteredComponents(filtered);
    setCurrentPage(1); // Reset về trang đầu tiên sau khi lọc
  };
  const handleManufacturerFilter = (e) => {
    const { name, checked } = e.target;
    const updatedFilter = { ...manufacturerFilter, [name]: checked };
    setManufacturerFilter(updatedFilter);

    // Get list of active manufacturers
    const activeManufacturers = Object.keys(updatedFilter).filter(
      (key) => updatedFilter[key]
    );

    // If no manufacturers are selected, show all components
    if (activeManufacturers.length === 0) {
      setFilteredComponents(components);
      setCurrentPage(1);
      return;
    }

    // Filter components based on selected manufacturers
    const filtered = components.filter((component) => {
      if (!component.title) return false;
      const componentTitle = component.title.toLowerCase();
      // Check if any of the selected manufacturers are in the title
      return activeManufacturers.some((manufacturer) =>
        componentTitle.includes(manufacturer.toLowerCase())
      );
    });

    // Log for debugging
    console.log(`Filtered by manufacturers: ${activeManufacturers.join(', ')}`);
    console.log(`Found ${filtered.length} matching components`);

    setFilteredComponents(filtered);
    setCurrentPage(1); // Reset to first page after filtering
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

  const getComponentHeaders = () => {
    const normalizeHeader = (header) =>
      header
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    return getRawComponentHeaders().map(normalizeHeader);
  };

  const getComponentRowData = (component) => {
    const ratingStars = (rating, count) => (
      <span>
        {'★'.repeat(Math.round(rating || 4)) + '☆'.repeat(5 - Math.round(rating || 4))} ({count || 0})
      </span>
    );

    switch (normalizedType) {
      case 'CPU':
        return [
          component.title,
          component.attributes?.['Core Count'] || 'N/A',
          component.attributes?.['Performance Core Clock'] || 'N/A',
          component.attributes?.['Performance Core Boost Clock'] || 'N/A',
          component.attributes?.['Socket'] || 'N/A',
          component.attributes?.['TDP'] || 'N/A',
          component.attributes?.['Integrated Graphics'] || 'None',
          ratingStars(4, component.attributes?.['Rating Count']),
          `$${component.price.toFixed(2)}`,
        ];
      case 'RAM':
        return [
          component.title,
          component.attributes?.['Speed'] || 'N/A',
          component.attributes?.['Modules'] || 'N/A',
          component.attributes?.['CAS Latency'] || 'N/A',
          component.attributes?.['Voltage'] || 'N/A',
          component.attributes?.['Timing'] || 'N/A',
          component.attributes?.['ECC / Registered'] || 'N/A',
          `$${component.price.toFixed(2)}`,
        ];
      case 'CPU Cooler':
        return [
          component.title,
          component.attributes?.['Fan RPM'] || 'N/A',
          component.attributes?.['Noise Level'] || 'N/A',
          component.attributes?.['Height'] || 'N/A',
          component.attributes?.['CPU Socket'] || 'N/A',
          component.attributes?.['Water Cooled'] || 'N/A',
          component.attributes?.['Fanless'] || 'N/A',
          `$${component.price.toFixed(2)}`,
        ];
      case 'Case':
        return [
          component.title,
          component.attributes?.['Type'] || 'N/A',
          component.attributes?.['Color'] || 'N/A',
          component.attributes?.['Side Panel'] || 'N/A',
          component.attributes?.['Motherboard Form Factor'] || 'N/A',
          component.attributes?.['Maximum Video Card Length'] || 'N/A',
          component.attributes?.['Drive Bays'] || 'N/A',
          `$${component.price.toFixed(2)}`,
        ];
      case 'GPU':
        return [
          component.title,
          component.attributes?.['Chipset'] || 'N/A',
          component.attributes?.['Memory'] || 'N/A',
          component.attributes?.['Core Clock'] || 'N/A',
          component.attributes?.['Boost Clock'] || 'N/A',
          component.attributes?.['TDP'] || 'N/A',
          component.attributes?.['Cooling'] || 'N/A',
          component.attributes?.['Interface'] || 'N/A',
          `$${component.price.toFixed(2)}`,
        ];
      case 'Mainboard':
        return [
          component.title,
          component.attributes?.['Socket/CPU'] || 'N/A',
          component.attributes?.['Form Factor'] || 'N/A',
          component.attributes?.['Chipset'] || 'N/A',
          component.attributes?.['Memory Max'] || 'N/A',
          component.attributes?.['Memory Slots'] || 'N/A',
          component.attributes?.['PCIe x16 Slots'] || 'N/A',
          `$${component.price.toFixed(2)}`,
        ];
      case 'PSU':
        return [
          component.title,
          component.attributes?.['Wattage'] || 'N/A',
          component.attributes?.['Efficiency Rating'] || 'N/A',
          component.attributes?.['Modular'] || 'N/A',
          component.attributes?.['ATX 4-Pin Connectors'] || 'N/A',
          component.attributes?.['PCIe 8-Pin Connectors'] || 'N/A',
          component.attributes?.['SATA Connectors'] || 'N/A',
          `$${component.price.toFixed(2)}`,
        ];
      case 'Storage':
        return [
          component.title,
          component.attributes?.['Capacity'] || 'N/A',
          component.attributes?.['Type'] || 'N/A',
          component.attributes?.['Form Factor'] || 'N/A',
          component.attributes?.['Interface'] || 'N/A',
          component.attributes?.['NVME'] || 'N/A',
          component.attributes?.['Cache'] || 'N/A',
          `$${component.price.toFixed(2)}`,
        ];
      default:
        return [component.title, `$${component.price.toFixed(2)}`];
    }
  };

  if (!normalizedType) {
    return (
      <div className="comp-search-error">
        <div className="comp-search-error-content">
          <h2>Invalid Component Type</h2>
          <p>Please select a valid component category from the menu.</p>
          <button onClick={() => navigate('/')}>Return to Home</button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="comp-search-error">
        <div className="comp-search-error-content">
          <h2>Error Loading Components</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>Return to Home</button>
        </div>
      </div>
    );
  }
  // Get manufacturers relevant to the current component type
  const getRelevantManufacturers = () => {
    const manufacturerMap = {
      CPU: ['AMD', 'Intel'],
      GPU: ['AMD', 'Nvidia', 'ASUS', 'MSI', 'Gigabyte', 'EVGA', 'Zotac', 'Sapphire'],
      RAM: ['Corsair', 'G.Skill', 'Kingston', 'Crucial', 'HyperX', 'Team Group', 'ADATA', 'Patriot'],
      Storage: ['Western Digital', 'Samsung', 'Seagate', 'Crucial', 'Kingston', 'SanDisk', 'ADATA', 'Intel'],
      Mainboard: ['ASUS', 'MSI', 'Gigabyte', 'ASRock', 'EVGA', 'Biostar', 'NZXT'],
      PSU: ['Corsair', 'EVGA', 'Seasonic', 'be quiet!', 'Thermaltake', 'Cooler Master', 'Antec', 'Silverstone'],
      'CPU Cooler': ['Noctua', 'Cooler Master', 'NZXT', 'be quiet!', 'Corsair', 'Deepcool', 'Arctic', 'Thermaltake'],
      Case: ['Corsair', 'NZXT', 'Fractal Design', 'Lian Li', 'Phanteks', 'Cooler Master', 'Thermaltake', 'be quiet!']
    };

    return manufacturerMap[normalizedType] || [];
  };

  return (
    <div className="comp-search-container">
      <div className="comp-search-header">
        <h1>{normalizedType} Components</h1>
        <div className="comp-search-header-actions">
          <div className="comp-search-search-bar">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder={`Search for ${normalizedType}...`}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                handleSearch(e);
              }}
            />
            {searchTerm && (
              <button
                className="comp-search-clear-search"
                onClick={() => {
                  setSearchTerm('');
                  setFilteredComponents(components);
                }}
              >
                ×
              </button>
            )}
          </div>
          <button
            className="comp-search-toggle-filters"
            onClick={() => setIsFilterVisible(!isFilterVisible)}
          >
            {isFilterVisible ? 'Hide Filters' : 'Show Filters'} <i className={`fas fa-filter ${isFilterVisible ? 'active' : ''}`}></i>
          </button>
        </div>
      </div>

      <div className="comp-search-content">
        {isFilterVisible && (
          <div className="comp-search-sidebar">
            <div className="comp-search-filter-section">
              <h3>Price Range</h3>
              <div className="comp-search-price-label">
                ${priceRange[0]} - ${priceRange[1].toLocaleString()}
              </div>              <div className="comp-search-price-slider">
                <div className="comp-search-price-track"></div>
                <div
                  className="comp-search-price-range-selected"
                  style={{
                    left: `${(priceRange[0] / 5000) * 100}%`,
                    right: `${100 - (priceRange[1] / 5000) * 100}%`
                  }}
                ></div>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  value={priceRange[0]}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    // Đảm bảo giá trị min không vượt quá giá trị max - 50
                    const newMin = Math.min(value, priceRange[1] - 50);
                    setPriceRange([newMin, priceRange[1]]);
                  }}
                  onMouseUp={handlePriceFilter} // Chỉ áp dụng bộ lọc khi người dùng thả chuột
                  onTouchEnd={handlePriceFilter} // Cho thiết bị cảm ứng
                />
                <input
                  type="range"
                  min="0"
                  max="5000"
                  value={priceRange[1]}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    // Đảm bảo giá trị max không nhỏ hơn giá trị min + 50
                    const newMax = Math.max(value, priceRange[0] + 50);
                    setPriceRange([priceRange[0], newMax]);
                  }}
                  onMouseUp={handlePriceFilter} // Chỉ áp dụng bộ lọc khi người dùng thả chuột
                  onTouchEnd={handlePriceFilter} // Cho thiết bị cảm ứng
                />
              </div>
            </div>            <div className="comp-search-filter-section">
              <h3>Manufacturer</h3>
              <div className="comp-search-checkbox-group">
                {getRelevantManufacturers().slice(0, showAllManufacturers ? getRelevantManufacturers().length : 4).map((manufacturer) => (
                  <label key={manufacturer}>
                    <input
                      type="checkbox"
                      name={manufacturer}
                      checked={manufacturerFilter[manufacturer] || false}
                      onChange={handleManufacturerFilter}
                    />
                    {manufacturer}
                  </label>
                ))}
              </div>
              {getRelevantManufacturers().length > 4 && (<button
                className="comp-search-see-more"
                onClick={() => setShowAllManufacturers(!showAllManufacturers)}
              >
                {showAllManufacturers ? 'See Less' : 'See More'}
              </button>
              )}
            </div>

            <button
              className="comp-search-reset-filters"
              onClick={() => {
                setPriceRange([0, 5000]);
                setManufacturerFilter({
                  AMD: false,
                  Intel: false,
                  Nvidia: false,
                  'Western Digital': false,
                  Samsung: false,
                  Corsair: false,
                  ASUS: false,
                  MSI: false,
                  Gigabyte: false,
                });
                setFilteredComponents(components);
              }}
            >
              Reset Filters
            </button>
          </div>
        )}

        <div className="comp-search-results-container">
          {filteredComponents.length === 0 ? (
            <div className="comp-search-no-results">
              <i className="fas fa-search"></i>
              <h3>No {normalizedType} components found</h3>
              <p>Try adjusting your search criteria or filters</p>
            </div>
          ) : (
            <>
              <div className="comp-search-results-header">
                <h2>{filteredComponents.length} Compatible {normalizedType} Products</h2>
                <div className="comp-search-sort">
                  <label>Sort by:</label>
                  <select
                    value={`${sortConfig.key}-${sortConfig.direction}`}
                    onChange={(e) => {
                      const [key, direction] = e.target.value.split('-');
                      setSortConfig({ key, direction });
                    }}
                  >
                    <option value="Price-asc">Price: Low to High</option>
                    <option value="Price-desc">Price: High to Low</option>
                    <option value="Name-asc">Name: A to Z</option>
                    <option value="Name-desc">Name: Z to A</option>
                  </select>
                </div>
              </div>

              <div className="comp-search-component-table">
                <table>
                  <thead>
                    <tr>
                      {getComponentHeaders().map((header, index) => {
                        const rawHeader = getRawComponentHeaders()[index];
                        const isSortable = rawHeader !== 'Action';
                        const isActiveSort = sortConfig.key === rawHeader;
                        const sortIconClass = isActiveSort
                          ? (sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
                          : 'fas fa-sort';

                        return (
                        <th
                          key={index}
                          onClick={() => isSortable && handleSort(rawHeader)}
                          className={isActiveSort ? 'comp-search-th-active' : ''}
                          style={{ cursor: isSortable ? 'pointer' : 'default' }}
                        >
                          {header} {isSortable && <i className={sortIconClass}></i>}
                        </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {currentComponents.map((component) => (
                      <tr key={component.product_id}>
                        {getComponentRowData(component).map((data, index) => (
                          <td key={index}>
                            {index === 0 ? (
                              <div className="comp-search-product-name">
                                <img
                                  src={component.image || 'https://via.placeholder.com/50x50?text=No+Image'}
                                  alt={component.title}
                                  onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = 'https://via.placeholder.com/50x50?text=Error';
                                  }}
                                />
                                <span
                                  onClick={() => navigate(`/product-info/${component.product_id}`)}
                                >
                                  {data}
                                </span>
                              </div>
                            ) : (
                              data
                            )}
                          </td>
                        ))}
                        <td>
                          <button
                            className="comp-search-add-button"
                            onClick={async () => {

                              try {
                                const productId = parseInt(component.product_id, 10); // Cơ số 10 để tránh các vấn đề với số bắt đầu bằng 0
                                // Gọi API để lấy thông tin chi tiết của component
                                const componentDetail = await fetchComponentById(productId);
                                console.log('ProductID:', productId);
                                console.log('Adding component:', componentDetail);
                                if (componentDetail.error) {
                                  console.error('Error fetching component details:', componentDetail.error);
                                  // Có thể thêm thông báo lỗi cho người dùng ở đây
                                  return;
                                }
                                // Nếu lấy dữ liệu thành công, chuyển hướng với dữ liệu đầy đủ
                                navigate('/build', {
                                  state: {
                                    addedComponent: componentDetail,
                                  },

                                });
                                console.log('Navigating to build with component:', componentDetail);
                              } catch (error) {
                                console.error('Failed to fetch component details:', error);
                                // Fallback: Nếu API gặp lỗi, vẫn dùng dữ liệu hiện có
                                // navigate('/build', {
                                //   state: {
                                //     addedComponent: component,
                                //   },
                                // });
                              }
                            }}
                          >
                            <i className="fas fa-plus"></i> Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredComponents.length > itemsPerPage && (
                <div className="comp-search-pagination">
                  <button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className={currentPage === 1 ? 'disabled' : ''}
                  >
                    <i className="fas fa-chevron-left"></i> Previous
                  </button>
                  <div className="comp-search-page-numbers">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNumber = currentPage <= 3
                        ? i + 1
                        : currentPage >= totalPages - 2
                          ? totalPages - 4 + i
                          : currentPage - 2 + i;

                      if (pageNumber <= totalPages) {
                        return (
                          <button
                            key={pageNumber}
                            className={currentPage === pageNumber ? 'active' : ''}
                            onClick={() => setCurrentPage(pageNumber)}
                          >
                            {pageNumber}
                          </button>
                        );
                      }
                      return null;
                    })}
                  </div>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className={currentPage === totalPages ? 'disabled' : ''}
                  >
                    Next <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComponentSearch;