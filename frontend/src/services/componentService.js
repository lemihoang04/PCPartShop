import axios from '../setup/axios';

/**
 * Fetches components by type with optional attribute filters
 * @param {string} type - Component type (CPU, GPU, RAM, etc.)
 * @param {Object} filters - Optional filters as key-value pairs
 * @returns {Promise<Array|Object>} - Components array or error object
 */
const fetchComponents = async (type, filters = {}) => {

  // Create URL and query params
  let url = `/components/${type}`;

  // Add filters as query parameters if provided
  const params = new URLSearchParams();
  if (Object.keys(filters).length > 0) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params.append(key, value);
      }
    });
  }

  // Append query string to URL if params exist
  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }


  console.log(`Fetching components from: ${url}`);
  const response = await axios.get(url);

  const data = response;
  console.log('Response data:', data);

  // Ensure data is an array
  if (Array.isArray(data)) {
    console.log(`Received ${data.length} components`);
    return data;
  } else {
    console.error('Expected array but got:', typeof data);
    return { error: 'Invalid data format from server' };
  }
};

const fetchComponentById = async (componentId) => {
  try {
    const response = await axios.get(`/components/${componentId}`);

    // Check if we have valid data
    if (response && typeof response === 'object') {
      console.log('Component data:', response);
      return response;
    } else {
      console.error('Invalid component data:', response);
      return { error: 'Invalid data format from server' };
    }
  } catch (error) {
    console.error(`Error fetching component with ID ${componentId}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return {
      error: error.response?.data?.error || `Failed to fetch component with ID ${componentId}`,
      status: error.response?.status
    };
  }
};

/**
 * Generic function to fetch compatible components via the unified endpoint.
 * Replaces all individual fetchCompatible* functions.
 * 
 * @param {string} componentType - One of 'cpu', 'cpu_cooler', 'mainboard', 'ram', 'case', 'psu', 'storage'
 * @param {string|number|null} filterValue - Filter value (socket, memory type, wattage, etc.)
 * @returns {Promise<Array|Object>} - Components array or error object
 */
const fetchCompatibleComponents = async (componentType, filterValue = null) => {
  try {
    let url = `/compatible/${componentType}`;
    if (filterValue != null) {
      url += `?filter=${encodeURIComponent(filterValue)}`;
    }

    console.log(`Fetching compatible ${componentType} from: ${url}`);
    const response = await axios.get(url);

    if (response && Array.isArray(response)) {
      console.log(`Received ${response.length} compatible ${componentType} components`);
      return response;
    } else if (response && typeof response === 'object') {
      return response;
    } else {
      console.error('Invalid data format:', response);
      return { error: 'Invalid data format from server' };
    }
  } catch (error) {
    console.error(`Error fetching compatible ${componentType}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return {
      error: error.response?.data?.error || `Failed to fetch compatible ${componentType}`,
      status: error.response?.status
    };
  }
};

// Backward-compatible wrappers (delegate to generic function)
const fetchCompatibleCPUs = (cpuSocket) => fetchCompatibleComponents('cpu', cpuSocket);
const fetchCompatibleCpuCoolers = (cpuSocket) => fetchCompatibleComponents('cpu_cooler', cpuSocket);
const fetchCompatibleMainboards = (cpuSocket) => fetchCompatibleComponents('mainboard', cpuSocket);
const fetchCompatibleRam = (memoryType) => fetchCompatibleComponents('ram', memoryType);
const fetchCompatibleStorage = () => fetchCompatibleComponents('storage');
const fetchCompatibleCases = (formFactor) => fetchCompatibleComponents('case', formFactor);
const fetchCompatiblePSU = (totalTDP) => fetchCompatibleComponents('psu', totalTDP);

export {
  fetchComponents,
  fetchComponentById,
  fetchCompatibleComponents,
  // Backward-compatible exports
  fetchCompatibleCPUs,
  fetchCompatibleCpuCoolers,
  fetchCompatibleMainboards,
  fetchCompatibleRam,
  fetchCompatibleStorage,
  fetchCompatibleCases,
  fetchCompatiblePSU
};