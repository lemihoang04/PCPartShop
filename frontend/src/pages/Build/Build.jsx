import { useNavigate, useLocation, useParams } from 'react-router-dom';
import React, { useState, useEffect, useRef, useContext } from 'react';
import { UserContext } from "../../context/UserProvider";
import { toast } from 'react-toastify';
import './Build.css';
import MotherboardUsage from './MotherboardUsage';
import {
  FaMicrochip,
  FaMemory,
  FaHdd,
  FaFan,
  FaCheck,
  FaCube,
  FaBolt,
  FaDesktop,
  FaShoppingCart,
  FaVideo,
  FaTrash,
  FaSave,
  FaHistory,
  FaTimes,
  FaLock,
  FaGlobe,
  FaTrashAlt
} from 'react-icons/fa';
import { savePCBuild, getBuildHistory, deleteBuild, getBuildBySlug } from '../../services/buildpcService';

// Helper function to parse memory capacity and convert to GB
function parseMemoryToGB(memoryString) {
  if (!memoryString) return 0;

  // Extract numeric part and unit
  const match = memoryString.match(/(\d+)\s*([GMK]B)/i);
  if (!match) return 0;

  const value = parseInt(match[1], 10);
  const unit = match[2].toUpperCase();

  // Convert to GB
  switch (unit) {
    case 'KB': return value / (1024 * 1024);
    case 'MB': return value / 1024;
    case 'GB': return value;
    default: return value;
  }
}

// Function to calculate total RAM capacity from modules
function calculateTotalRAMCapacity(rams) {
  let totalGB = 0;

  rams.forEach(ram => {
    if (!ram || !ram.attributes || !ram.attributes["Modules"]) return;

    const modulesStr = ram.attributes["Modules"];
    // Expected format: "2 x 8GB", extract numbers
    const match = modulesStr.match(/(\d+)\s*x\s*(\d+)\s*([GMK]B)/i);
    if (match && match[1] && match[2] && match[3]) {
      const moduleCount = parseInt(match[1], 10);
      const moduleSize = parseInt(match[2], 10);
      const unit = match[3].toUpperCase();
      // Convert to GB and add to total
      let sizeInGB = moduleSize;
      switch (unit) {
        case 'KB': sizeInGB = moduleSize / (1024 * 1024); break;
        case 'MB': sizeInGB = moduleSize / 1024; break;
        default: break; // GB or unknown units, keep as is
      }

      totalGB += moduleCount * sizeInGB;
    }
  });

  return totalGB;
}

// Function to extract module count from RAM's Modules attribute
function getModuleCount(ram) {
  if (!ram || !ram.attributes || !ram.attributes["Modules"]) return 1; // Default to 1 if not specified

  const modulesStr = ram.attributes["Modules"];
  // Expected format: "2 x 8GB", extract the first number
  const match = modulesStr.match(/^(\d+)\s*x/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return 1; // Default to 1 if parsing fails
}

// Helper function to count M.2 slots from motherboard attribute
function countM2Slots(motherboard) {
  // console.log('Motherboard:', motherboard.attributes["M.2 Slots"].split(',').length);
  if (!motherboard || !motherboard.attributes || !motherboard.attributes["M.2 Slots"]) return 0;
  return motherboard.attributes["M.2 Slots"].split(',').length;
}

// Helper function to get number of SATA ports
function getSataPorts(motherboard) {
  if (!motherboard || !motherboard.attributes) return 0;
  const sataPorts = motherboard.attributes["SATA 6.0 Gb/s"];
  return sataPorts ? parseInt(sataPorts, 10) : 0;
}

// Function to categorize storage devices
function categorizeStorageDevices(storages) {
  const result = {
    m2Devices: [],
    sataDevices: []
  };

  storages.forEach(storage => {
    if (!storage || !storage.attributes) return;

    const interfaceType = storage.attributes["Interface"] || '';

    // Check if it's an M.2 NVMe device (contains M.2 but not SATA)
    if (interfaceType.includes('M.2') && !interfaceType.includes('SATA')) {
      result.m2Devices.push(storage);
    }
    // Check if it's a SATA device
    else if (interfaceType.includes('SATA')) {
      result.sataDevices.push(storage);
    }
    // Default to SATA for other storage devices
    else {
      result.sataDevices.push(storage);
    }
  });

  return result;
}

// Function to categorize GPUs based on interface and memory
function categorizeGPUs(gpus) {
  const result = {
    x16GPUs: [],
    x8GPUs: [],
    x4GPUs: []
  };

  gpus.forEach(gpu => {
    if (!gpu || !gpu.attributes) return;

    const interface_ = gpu.attributes["Interface"] || '';
    const memoryGB = parseInt(gpu.attributes["Memory"] || '0');

    // High-end GPUs typically need x16
    if (memoryGB >= 8 || interface_.includes('x16')) {
      result.x16GPUs.push(gpu);
    }
    // Mid-range GPUs can use x8
    else if (memoryGB >= 4 || interface_.includes('x8')) {
      result.x8GPUs.push(gpu);
    }
    // Low-end GPUs can use x4 or x1
    else {
      result.x4GPUs.push(gpu);
    }
  });

  return result;
}

const Build = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, fetchUser } = useContext(UserContext);
  const { slug } = useParams();

  // ── Save Build modal state ──
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveBuildName, setSaveBuildName] = useState('');
  const [saveBuildDesc, setSaveBuildDesc] = useState('');
  const [saveBuildPublic, setSaveBuildPublic] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // ── Build History panel state ──
  const [showHistory, setShowHistory] = useState(false);
  const [buildHistory, setBuildHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const historyRef = useRef(null);
  const [components, setComponents] = useState(() => {
    // Restore state from sessionStorage if available
    try {
      const savedComponents = sessionStorage.getItem('components');
      if (savedComponents) {
        const parsed = JSON.parse(savedComponents);
        console.log('Restored components from sessionStorage:', parsed);

        // Merge saved data with default component structure (including icons)
        const defaultComponents = [
          { id: 'cpu', name: 'CPU', selected: null, multiple: false, icon: <FaMicrochip /> },
          { id: 'cpu Cooler', name: 'CPU Cooler', selected: null, multiple: false, icon: <FaFan /> },
          { id: 'Mainboard', name: 'Mainboard', selected: null, multiple: false, icon: <FaDesktop /> },
          { id: 'ram', name: 'RAM', selected: [], multiple: true, icon: <FaMemory /> },
          { id: 'storage', name: 'Storage', selected: [], multiple: true, icon: <FaHdd /> },
          { id: 'gpu', name: 'GPU', selected: [], multiple: true, icon: <FaVideo /> },
          { id: 'case', name: 'Case', selected: null, multiple: false, icon: <FaCube /> },
          { id: 'psu', name: 'PSU', selected: null, multiple: false, icon: <FaBolt /> },
        ];

        // Merge saved selections with default structure
        const restoredComponents = defaultComponents.map(defaultComponent => {
          const savedComponent = parsed.find(saved => saved.id === defaultComponent.id);
          return savedComponent ? {
            ...defaultComponent,
            selected: savedComponent.selected
          } : defaultComponent;
        });

        return restoredComponents;
      }
    } catch (error) {
      console.error('Error parsing components from sessionStorage:', error);
      // Clear corrupted data
      sessionStorage.removeItem('components');
    }

    // Default components structure
    const defaultComponents = [
      { id: 'cpu', name: 'CPU', selected: null, multiple: false, icon: <FaMicrochip /> },
      { id: 'cpu Cooler', name: 'CPU Cooler', selected: null, multiple: false, icon: <FaFan /> },
      { id: 'Mainboard', name: 'Mainboard', selected: null, multiple: false, icon: <FaDesktop /> },
      { id: 'ram', name: 'RAM', selected: [], multiple: true, icon: <FaMemory /> },
      { id: 'storage', name: 'Storage', selected: [], multiple: true, icon: <FaHdd /> },
      { id: 'gpu', name: 'GPU', selected: [], multiple: true, icon: <FaVideo /> },
      { id: 'case', name: 'Case', selected: null, multiple: false, icon: <FaCube /> },
      { id: 'psu', name: 'PSU', selected: null, multiple: false, icon: <FaBolt /> },
    ];

    console.log('Using default components structure');
    return defaultComponents;
  });

  const [expansionItems] = useState([
    'Sound Cards', 'Wired Network Adapters', 'Wireless Network Adapters'
  ]);

  const [peripherals] = useState([
    'Headphones', 'Keyboards', 'Mice', 'Speakers', 'Webcams'
  ]);

  const [accessories] = useState([
    'Case Accessories', 'Case Fans', 'Fan Controllers', 'Thermal Compound',
    'External Storage', 'Optical Drives', 'UPS Systems'
  ]);

  // State for compatibility issues
  const [compatibilityIssues, setCompatibilityIssues] = useState([
    { type: 'problem', message: 'Two additional RAM slots are needed.' },
    { type: 'disclaimer', message: 'Some physical constraints are not checked, such as RAM clearance with CPU Coolers.' }
  ]);

  // Memory compatibility check state
  const [memoryCompatible, setMemoryCompatible] = useState(true);

  const totalWattage = calculateWattage();

  // Add a state variable to track overall compatibility
  const [isCompatible, setIsCompatible] = useState(true);

  function calculateTotalPrice() {
    // Object to store price of each component category
    const componentTotals = {};
    let grandTotal = 0;

    // Calculate price for each component separately
    components.forEach(component => {
      let categoryTotal = 0;

      if (component.multiple && component.selected && component.selected.length > 0) {
        // For multiple components (RAM, Storage, GPU)
        categoryTotal = component.selected.reduce((sum, item) =>
          sum + (item && item['price'] ? Number(item['price']) : 0), 0);
      } else if (component.selected && component.selected['price']) {
        // For single components (CPU, Mainboard, etc.)
        categoryTotal = Number(component.selected['price']);
      }

      // Store category total and add to grand total
      componentTotals[component.id] = categoryTotal;
      grandTotal += categoryTotal;
    });

    return grandTotal; // Return the sum of all components
  }

  const totalPrice = calculateTotalPrice();

  // Get selected mainboard (if any)
  const selectedMainboard = components.find(component => component.id === 'Mainboard')?.selected || null;

  // Get list of selected RAMs
  const selectedRams = components.find(component => component.id === 'ram')?.selected || [];

  // Get other components if needed
  const selectedCpu = components.find(component => component.id === 'cpu')?.selected || null;
  const selectedStorages = components.find(component => component.id === 'storage')?.selected || [];
  const selectedGpus = components.find(component => component.id === 'gpu')?.selected || [];
  // Component mount effect - verify sessionStorage sync
  useEffect(() => {
    console.log('Build component mounted, current components:', components);

    // Force a sessionStorage sync on mount
    try {
      const currentSessionData = sessionStorage.getItem('components');
      if (currentSessionData) {
        const parsed = JSON.parse(currentSessionData);
        console.log('Current sessionStorage data:', parsed);
      }
    } catch (error) {
      console.error('Error reading sessionStorage on mount:', error);
    }

    // Listen for storage events (when sessionStorage changes in other tabs)
    const handleStorageChange = (e) => {
      if (e.key === 'components' && e.newValue) {
        try {
          const updatedComponents = JSON.parse(e.newValue);
          console.log('SessionStorage updated from another tab:', updatedComponents);
          setComponents(updatedComponents);
        } catch (error) {
          console.error('Error parsing storage event data:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []); // Empty dependency array means this runs once on mount

  // Load build by slug if present in URL
  const loadBuildFromSlug = async (buildSlug) => {
    try {
      const res = await getBuildBySlug(buildSlug);
      if (res && res.items) {
        // Initialize default structure
        const defaultComponents = [
          { id: 'cpu', name: 'CPU', selected: null, multiple: false, icon: <FaMicrochip /> },
          { id: 'cpu Cooler', name: 'CPU Cooler', selected: null, multiple: false, icon: <FaFan /> },
          { id: 'Mainboard', name: 'Mainboard', selected: null, multiple: false, icon: <FaDesktop /> },
          { id: 'ram', name: 'RAM', selected: [], multiple: true, icon: <FaMemory /> },
          { id: 'storage', name: 'Storage', selected: [], multiple: true, icon: <FaHdd /> },
          { id: 'gpu', name: 'GPU', selected: [], multiple: true, icon: <FaVideo /> },
          { id: 'case', name: 'Case', selected: null, multiple: false, icon: <FaCube /> },
          { id: 'psu', name: 'PSU', selected: null, multiple: false, icon: <FaBolt /> },
        ];

        // Map items from database to defaultComponents
        const loadedComponents = defaultComponents.map(component => {
          const matchingItems = res.items.filter(item => item.category_name === component.name);
          if (component.multiple) {
            return {
              ...component,
              selected: matchingItems.map(item => ({
                product_id: item.product_id,
                title: item.title,
                price: item.price,
                image: item.image,
                stock: item.stock,
                category_name: item.category_name,
                category_id: item.category_id,
                attributes: item.attributes || {}
              }))
            };
          } else {
            const match = matchingItems[0];
            return {
              ...component,
              selected: match ? {
                product_id: match.product_id,
                title: match.title,
                price: match.price,
                image: match.image,
                stock: match.stock,
                category_name: match.category_name,
                category_id: match.category_id,
                attributes: match.attributes || {}
              } : null
            };
          }
        });

        setComponents(loadedComponents);
        toast.success(`Loaded build: ${res.build_name}`);
      }
    } catch (err) {
      console.error("Error loading build by slug:", err);
      toast.error(err?.error || "Failed to load build.");
    }
  };

  useEffect(() => {
    if (slug) {
      loadBuildFromSlug(slug);
    }
  }, [slug]);


  // Update compatibility issues whenever components change
  useEffect(() => {
    const issues = [];
    let isCompatible = true;

    // Check RAM compatibility
    const motherboard = components.find(c => c.id === 'Mainboard')?.selected;
    const rams = components.find(c => c.id === 'ram')?.selected || [];
    const storages = components.find(c => c.id === 'storage')?.selected || [];
    const gpus = components.find(c => c.id === 'gpu')?.selected || [];

    if (motherboard && rams.length > 0) {
      // Calculate total RAM modules using getModuleCount
      const totalRamModules = rams.reduce((sum, ram) => {
        return sum + getModuleCount(ram);
      }, 0);

      // Check RAM slot count against total module count
      const ramSlots = motherboard.specs?.memorySlots || motherboard.attributes?.["Memory Slots"] || 4;
      if (totalRamModules > ramSlots) {
        issues.push({
          type: 'problem',
          message: `Your motherboard only supports ${ramSlots} RAM modules, but you've selected ${totalRamModules} modules in total.`
        });
        isCompatible = false; // RAM slots exceeded, set compatibility to false
      }

      // Check RAM capacity against motherboard max memory
      const maxMemoryStr = motherboard.attributes?.["Memory Max"];
      if (maxMemoryStr) {
        const maxMemoryGB = parseMemoryToGB(maxMemoryStr);
        const totalRAMCapacityGB = calculateTotalRAMCapacity(rams);

        if (totalRAMCapacityGB > maxMemoryGB) {
          issues.push({
            type: 'problem',
            message: `Total RAM capacity (${totalRAMCapacityGB}GB) exceeds motherboard maximum (${maxMemoryGB}GB).`
          });
          isCompatible = false; // RAM capacity exceeded, set compatibility to false
        }
      }

      // Set memory compatibility based on all checks above
      setMemoryCompatible(isCompatible);
    }

    // Check storage compatibility
    if (motherboard && storages.length > 0) {
      const { m2Devices, sataDevices } = categorizeStorageDevices(storages);
      console.log('M.2 Devices:', m2Devices.length);
      // Get available slots from motherboard
      const availableM2Slots = countM2Slots(motherboard);
      const availableSataPorts = getSataPorts(motherboard);

      // Check M.2 compatibility
      if (m2Devices.length > availableM2Slots) {
        issues.push({
          type: 'problem',
          message: `M.2 device count (${m2Devices.length}) exceeds available M.2 slots (${availableM2Slots}).`
        });
        isCompatible = false;
      }

      // Check SATA compatibility
      if (sataDevices.length > availableSataPorts) {
        issues.push({
          type: 'problem',
          message: `SATA device count (${sataDevices.length}) exceeds available SATA ports (${availableSataPorts}).`
        });
        isCompatible = false;
      }
    }

    // Check GPU compatibility
    if (motherboard && gpus.length > 0) {
      const availablePcieX16Slots = parseInt(motherboard.attributes?.["PCIe x16 Slots"] || '0');
      const availablePcieX1Slots = parseInt(motherboard.attributes?.["PCIe x1 Slots"] || '0');
      const { x16GPUs, x8GPUs, x4GPUs } = categorizeGPUs(gpus);

      const totalGPUs = gpus.length;

      // Check if high-end GPUs can fit in x16 slots
      if (x16GPUs.length > availablePcieX16Slots) {
        issues.push({
          type: 'problem',
          message: `High-end GPUs require x16 slots: ${x16GPUs.length} GPUs for ${availablePcieX16Slots} x16 slots.`
        });
        isCompatible = false;
      }

      // Check total GPU count vs available slots
      const totalSlots = availablePcieX16Slots + availablePcieX1Slots;
      if (totalGPUs > totalSlots) {
        issues.push({
          type: 'problem',
          message: `Too many GPUs: ${totalGPUs} GPUs for ${totalSlots} total PCIe slots.`
        });
        isCompatible = false;
      }
    }

    // Check Case and Motherboard Form Factor
    const case_ = components.find(c => c.id === 'case')?.selected;
    if (case_ && motherboard) {
      const caseMbSupportStr = case_.attributes?.["Motherboard Form Factor"];
      const mbFormFactorStr = motherboard.attributes?.["Form Factor"];
      
      if (caseMbSupportStr && mbFormFactorStr) {
        if (!caseMbSupportStr.toLowerCase().includes(mbFormFactorStr.toLowerCase())) {
          issues.push({
            type: 'problem',
            message: `Case does not support the Motherboard's form factor (${mbFormFactorStr}).`
          });
          isCompatible = false;
        }
      }
    }

    // Check Case and GPU Length
    if (case_ && gpus.length > 0) {
      const caseMaxGpuLengthStr = case_.attributes?.["Maximum Video Card Length"];
      let caseMaxGpuLength = 0;
      if (caseMaxGpuLengthStr) {
        const match = caseMaxGpuLengthStr.match(/(\d+)/);
        if (match) caseMaxGpuLength = parseInt(match[1]);
      }

      if (caseMaxGpuLength > 0) {
        gpus.forEach(gpu => {
          const gpuLengthStr = gpu.attributes?.["Length"];
          if (gpuLengthStr) {
            const match = gpuLengthStr.match(/(\d+)/);
            if (match) {
              const gpuLength = parseInt(match[1]);
              if (gpuLength > caseMaxGpuLength) {
                issues.push({
                  type: 'problem',
                  message: `GPU Length (${gpuLength}mm) exceeds the Case's maximum supported length (${caseMaxGpuLength}mm).`
                });
                isCompatible = false;
              }
            }
          }
        });
      }
    }

    // Check CPU and Motherboard Socket compatibility
    const cpu = components.find(c => c.id === 'cpu')?.selected;
    if (cpu && motherboard) {
      const cpuSocket = cpu.attributes?.["Socket"];
      const mbSocket = motherboard.attributes?.["Socket/CPU"];
      if (cpuSocket && mbSocket && cpuSocket !== mbSocket) {
        issues.push({
          type: 'problem',
          message: `CPU Socket (${cpuSocket}) is incompatible with Motherboard Socket (${mbSocket}).`
        });
        isCompatible = false;
      }
    }

    // Check CPU Cooler and CPU/Motherboard Socket compatibility
    const cpuCooler = components.find(c => c.id === 'cpu Cooler')?.selected;
    if (cpuCooler) {
      const coolerSocketsStr = cpuCooler.attributes?.["Socket"] || cpuCooler.attributes?.["CPU Socket"];
      const targetSocket = cpu?.attributes?.["Socket"] || motherboard?.attributes?.["Socket/CPU"];
      
      if (coolerSocketsStr && targetSocket) {
        if (!coolerSocketsStr.includes(targetSocket)) {
          issues.push({
            type: 'problem',
            message: `CPU Cooler does not support the required socket (${targetSocket}).`
          });
          isCompatible = false;
        }
      }
    }

    // Check Motherboard and RAM memory type
    if (motherboard && rams.length > 0) {
      const mbMemTypeStr = motherboard.attributes?.["Memory Type"];
      let mbMemType = null;
      if (mbMemTypeStr) {
        const mbMemTypeMatch = mbMemTypeStr.match(/(DDR\d)/i);
        if (mbMemTypeMatch) mbMemType = mbMemTypeMatch[1].toUpperCase();
      }

      if (mbMemType) {
        let ramMismatch = false;
        let mismatchedRamType = '';
        rams.forEach(ram => {
          const ramSpeedStr = ram.attributes?.["Speed"] || ram.attributes?.["Memory Type"];
          if (ramSpeedStr) {
            const ramMemTypeMatch = ramSpeedStr.match(/(DDR\d)/i);
            if (ramMemTypeMatch) {
              const ramMemType = ramMemTypeMatch[1].toUpperCase();
              if (ramMemType !== mbMemType) {
                ramMismatch = true;
                mismatchedRamType = ramMemType;
              }
            }
          }
        });
        
        if (ramMismatch) {
          issues.push({
            type: 'problem',
            message: `Selected RAM (${mismatchedRamType}) is incompatible with the Motherboard's memory type (${mbMemType}).`
          });
          isCompatible = false;
        }
      }
    }

    // Check PSU compatibility
    const psu = components.find(c => c.id === 'psu')?.selected;
    if (psu) {
      const systemWattage = calculateWattage();
      let psuWattage = 0;

      const wattageFromTitle = psu.title?.match(/(\d+)W/i);
      const wattageFromAttrs = psu.attributes?.["Wattage"] || psu.attributes?.["Power"];

      if (wattageFromAttrs) {
        psuWattage = parseInt(wattageFromAttrs.toString().replace(/\D/g, '')) || 0;
      } else if (wattageFromTitle) {
        psuWattage = parseInt(wattageFromTitle[1]) || 0;
      }

      if (psuWattage > 0 && psuWattage < systemWattage) {
        issues.push({
          type: 'problem',
          message: `The selected PSU (${psuWattage}W) does not provide enough power for the estimated system load (${systemWattage}W).`
        });
        isCompatible = false;
      }
    }

    // Update the overall compatibility state
    setIsCompatible(isCompatible);
    setCompatibilityIssues(issues);
  }, [components]);

  // Compatibility config: which component depends on which, and what attribute to pass
  const COMPAT_CONFIG = {
    'cpu': [
      { depends: 'Mainboard', attr: 'Socket/CPU', param: 'cpu_socket' }
    ],
    'cpu Cooler': [
      { depends: 'cpu', attr: 'Socket', param: 'cpu_socket' },
      { depends: 'Mainboard', attr: 'Socket/CPU', param: 'cpu_socket' }
    ],
    'Mainboard': [
      { depends: 'cpu', attr: 'Socket', param: 'cpu_socket' },
      { depends: 'ram', attr: 'Speed', param: 'memory_type', extractPattern: /(DDR\d)/ },
      { depends: 'case', attr: 'Motherboard Form Factor', param: 'form_factor' }
    ],
    'ram': [
      { depends: 'Mainboard', attr: 'Memory Type', param: 'memory_type' }
    ],
    'case': [
      { depends: 'Mainboard', attr: 'Form Factor', param: 'form_factor' },
      // case needs min_gpu_length >= gpu's Length
      { depends: 'gpu', attr: 'Length', param: 'min_gpu_length', numeric: true }
    ],
    'gpu': [
      { depends: 'case', attr: 'Maximum Video Card Length', param: 'max_gpu_length', numeric: true }
    ],
  };

  const handleCategoryClick = (componentId) => {
    let path = `/components/${encodeURIComponent(componentId)}`;
    const queryParams = new URLSearchParams();

    // PSU uses totalWattage directly
    if (componentId === 'psu') {
      queryParams.append('wattage', totalWattage);
      navigate(`${path}?${queryParams.toString()}`);
      return;
    }

    // Check if this component has compatibility dependencies
    const configs = COMPAT_CONFIG[componentId];
    if (configs) {
      configs.forEach(config => {
        const depComponent = components.find(c => c.id === config.depends);
        if (!depComponent) return;

        // Handle multiple selections (like RAM or GPU) or single selections
        const deps = depComponent.multiple ? (depComponent.selected || []) : (depComponent.selected ? [depComponent.selected] : []);

        deps.forEach(dep => {
          let value = dep.attributes?.[config.attr];
          if (value) {
            // Extract regex pattern if specified
            if (config.extractPattern) {
              const match = value.toString().match(config.extractPattern);
              if (match) value = match[1];
            }
            // Parse numeric values (e.g. "315 mm / 12.402" → "315") for numeric filters
            if (config.numeric) {
              const match = value.toString().match(/(\d+)/);
              value = match ? parseInt(match[1]) : value;
            }
            queryParams.append(config.param, value);
          }
        });
      });
    }

    const queryString = queryParams.toString();
    navigate(queryString ? `${path}?${queryString}` : path);
  };
  // Save state to sessionStorage each time components change
  useEffect(() => {
    try {
      // Create a serializable version of components by excluding React icons and other non-serializable properties
      const serializableComponents = components.map(component => ({
        id: component.id,
        name: component.name,
        selected: component.selected,
        multiple: component.multiple
        // Exclude 'icon' property as it contains React elements which cause circular references
      }));

      const componentsToSave = JSON.stringify(serializableComponents);
      sessionStorage.setItem('components', componentsToSave);
      console.log('Components saved to sessionStorage:', serializableComponents);
    } catch (error) {
      console.error('Error saving components to sessionStorage:', error);
    }
  }, [components]);
  // Handle data sent from ComponentSearch.jsx
  useEffect(() => {
    if (location.state?.addedComponent) {
      const componentDetail = location.state.addedComponent;
      console.log('Adding component from ComponentSearch:', componentDetail);

      setComponents((prevComponents) => {
        const updatedComponents = prevComponents.map((component) => {
          if (component.name === componentDetail.category_name) {
            if (component.multiple) {
              // If component supports multiple selections
              const currentSelected = component.selected || [];
              const newSelected = [...currentSelected, componentDetail];
              console.log(`Added to ${component.name}, new count: ${newSelected.length}`);
              return {
                ...component,
                selected: newSelected,
              };
            } else {
              // If component only supports one selection
              console.log(`Replaced ${component.name} selection`);
              return { ...component, selected: componentDetail };
            }
          }
          return component;
        });

        return updatedComponents;
      });

      // Clear the location state to prevent re-adding on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);  // Hàm handleRemoveComponent - Xử lý xóa component
  const handleRemoveComponent = (componentId, index = null) => {
    console.log(`Removing component: ${componentId}, index: ${index}`);

    setComponents((prevComponents) => {
      const updatedComponents = prevComponents.map((comp) => {
        if (comp.id === componentId) {
          if (comp.multiple && index !== null) {
            // Xóa một mục cụ thể khỏi mảng đã chọn
            const newSelected = [...comp.selected];
            newSelected.splice(index, 1);
            console.log(`Removed item at index ${index} from ${componentId}, remaining: ${newSelected.length}`);
            return { ...comp, selected: newSelected };
          } else {
            // Xóa tất cả các mục đã chọn nếu không phải dạng multiple hoặc không có chỉ mục
            console.log(`Cleared all selections for ${componentId}`);
            return { ...comp, selected: comp.multiple ? [] : null };
          }
        }
        return comp;
      });

      // Remove manual sessionStorage update here since useEffect handles it
      console.log('Component removal completed, useEffect will handle sessionStorage update');

      return updatedComponents;
    });
  };

  // Function to clear all components (for debugging)
  const clearAllComponents = () => {
    console.log('Clearing all components');
    setComponents(prevComponents =>
      prevComponents.map(comp => ({
        ...comp,
        selected: comp.multiple ? [] : null
      }))
    );
  };

  // ── Collect items from current components for saving ──
  const collectBuildItems = () => {
    const items = [];
    components.forEach(component => {
      if (component.multiple && component.selected && component.selected.length > 0) {
        component.selected.forEach(item => {
          if (item && item.product_id && item.category_id) {
            items.push({
              product_id: item.product_id,
              category_id: item.category_id,
              quantity: 1,
            });
          }
        });
      } else if (!component.multiple && component.selected) {
        const sel = component.selected;
        if (sel && sel.product_id && sel.category_id) {
          items.push({
            product_id: sel.product_id,
            category_id: sel.category_id,
            quantity: 1,
          });
        }
      }
    });
    return items;
  };

  const handleOpenSaveModal = () => {
    if (!user || !user.account.id) {
      toast.error('Vui lòng đăng nhập để lưu cấu hình!');
      return;
    }
    const items = collectBuildItems();
    if (items.length === 0) {
      alert('Please select at least one component before saving.');
      return;
    }
    setSaveError('');
    setSaveSuccess('');
    setSaveBuildName('');
    setSaveBuildDesc('');
    setSaveBuildPublic(true);
    setShowSaveModal(true);
  };

  const handleSaveBuild = async () => {
    if (!saveBuildName.trim()) {
      setSaveError('Build name is required.');
      return;
    }
    const items = collectBuildItems();
    if (items.length === 0) {
      setSaveError('No components selected.');
      return;
    }
    setSaveLoading(true);
    setSaveError('');
    try {
      const res = await savePCBuild({
        build_name: saveBuildName.trim(),
        description: saveBuildDesc,
        is_public: saveBuildPublic,
        items,
      });
      setSaveSuccess(`Build saved! Slug: ${res.slug}`);
      // Refresh history if open
      if (showHistory) loadBuildHistory();
    } catch (err) {
      setSaveError(err?.error || 'Failed to save build. Are you logged in?');
    } finally {
      setSaveLoading(false);
    }
  };

  const loadBuildHistory = async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await getBuildHistory();
      setBuildHistory(res || []);
    } catch (err) {
      setHistoryError(err?.error || 'Failed to load history. Are you logged in?');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleHistory = () => {
    if (!user || !user.account.id) {
      toast.error('Vui lòng đăng nhập để xem lịch sử cấu hình!');
      return;
    }
    if (!showHistory) {
      loadBuildHistory();
    }
    setShowHistory(prev => !prev);
  };

  const handleDeleteBuild = async (buildId) => {
    if (!window.confirm('Delete this build?')) return;
    try {
      await deleteBuild(buildId);
      setBuildHistory(prev => prev.filter(b => b.id !== buildId));
    } catch (err) {
      alert(err?.error || 'Failed to delete build.');
    }
  };

  const handleBuyNow = () => {
    // Check if there are any components selected
    const hasSelectedComponents = components.some(component =>
      component.multiple
        ? (component.selected && component.selected.length > 0)
        : component.selected !== null
    );

    if (!hasSelectedComponents) {
      alert("Please select at least one component before proceeding to checkout.");
      return;
    }

    // Create items array from the selected components
    const items = [];

    components.forEach(component => {
      if (component.multiple && component.selected && component.selected.length > 0) {
        // For components with multiple selections (RAM, Storage, GPU)
        component.selected.forEach(item => {
          items.push({
            product_id: item.product_id || item.id,
            price: item.price || 0,
            title: item.title || item.name,
            quantity: 1,
            image: item.image
          });
        });
      } else if (!component.multiple && component.selected) {
        // For components with single selection (CPU, Mainboard, etc.)
        items.push({
          product_id: component.selected.product_id || component.selected.id,
          price: component.selected.price || 0,
          title: component.selected.title || component.selected.name,
          quantity: 1,
          image: component.selected.image
        });
      }
    });

    const amount = totalPrice;
    const isBuyNow = true;
    const formValue = { items, amount, isBuyNow };

    console.log("PC Build items to buy:", items);
    navigate("/checkout", {
      state: { formValue }
    });
  };
  return (
    <div className="build-container">
      <div className={`header ${!isCompatible ? 'incompatible' : ''}`}>
        <div className="compatibility">
          <span className="icon"><FaCheck /></span>
          <span className="label">Compatibility Check:</span>
          <span className="notes">See <a href="#notes">details</a> below.</span>
        </div>
        <div className="header-actions">
          <div className="wattage">
            <span className="icon"><FaBolt /></span>
            <span>Power Required: {calculateWattage()}W</span>
          </div>
          <button className="save-build-btn" onClick={handleOpenSaveModal} title="Save this build">
            <FaSave style={{ marginRight: '6px' }} />
            Save Build
          </button>
          <button
            className={`history-btn ${showHistory ? 'active' : ''}`}
            onClick={handleToggleHistory}
            title="View saved builds"
          >
            <FaHistory style={{ marginRight: '6px' }} />
            History
          </button>
        </div>
      </div>

      {/* ── Build History Panel ── */}
      {showHistory && (
        <div className="build-history-panel" ref={historyRef}>
          <div className="history-header">
            <h3><FaHistory style={{ marginRight: '8px' }} />Saved Builds</h3>
            <button className="close-history-btn" onClick={() => setShowHistory(false)}><FaTimes /></button>
          </div>
          {historyLoading && <div className="history-loading">Loading...</div>}
          {historyError && <div className="history-error">{historyError}</div>}
          {!historyLoading && !historyError && buildHistory.length === 0 && (
            <div className="history-empty">No saved builds yet. Start building and save!</div>
          )}
          {!historyLoading && buildHistory.map(build => (
            <div key={build.id} className="history-item">
              <div className="history-item-info">
                <div className="history-item-name">
                  {build.is_public ? <FaGlobe className="visibility-icon public" /> : <FaLock className="visibility-icon private" />}
                  {build.build_name}
                </div>
                <div className="history-item-meta">
                  <span>{build.component_count} component{build.component_count !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{new Date(build.created_at).toLocaleDateString()}</span>
                </div>
                {build.description && <div className="history-item-desc">{build.description}</div>}
              </div>
              <div className="history-item-actions">
                <button
                  className="history-view-btn"
                  onClick={() => navigate(`/shared-build/${build.slug}`)}
                  title="View build"
                >
                  View
                </button>
                <button
                  className="history-delete-btn"
                  onClick={() => handleDeleteBuild(build.id)}
                  title="Delete build"
                >
                  <FaTrashAlt />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <table className="components-table">
        <thead>
          <tr>
            <th className="component-col">Component</th>
            <th className="selection-col">Selection</th>
            <th className="availability-col">Availability</th>
            <th className="price-col">Price</th>
            <th className="action-col">Action</th>
          </tr>
        </thead>
        <tbody>
          {components.map((component) => (
            <React.Fragment key={component.id}>
              {component.multiple ? (
                // Handling for components that can be selected multiple times (RAM, Storage, GPU)
                <>
                  {/* Display component name if no selection yet */}
                  {component.selected.length === 0 && (
                    <tr className="component-row">
                      <td className="component-name">
                        <div>
                          <span className="component-icon">{component.icon}</span>
                          {component.name}
                        </div>
                      </td>
                      <td className="selection">
                        <button
                          className="choose-btn"
                          onClick={() => handleCategoryClick(component.id)}
                        >
                          Choose {component.name}
                        </button>
                      </td>
                      <td className="availability">—</td>
                      <td className="price">—</td>
                      <td className="actions"></td>
                    </tr>
                  )}

                  {/* Display selected items */}
                  {component.selected.map((item, index) => (
                    <tr key={`${component.id}-${index}`} className="component-row">
                      {/* Only show component name in first row */}
                      {index === 0 && (
                        <td className="component-name" rowSpan={component.selected.length}>
                          <div>
                            <span className="component-icon">{component.icon}</span>
                            {component.name}
                          </div>
                        </td>
                      )}
                      <td className="selection">
                        <div
                          className="selected-component"
                          onClick={() => navigate(`/product-info/${item.product_id || item.id}`)}
                        >
                          <img src={item.image} alt={item.name} />
                          <span>
                            {component.id === 'ram' ? formatRAMDisplayText(item) : item.title}
                          </span>
                        </div>
                      </td>
                      <td className={`availability ${item.stock > 0 ? 'in-stock' : 'out-of-stock'}`}>
                        <span className="availability-badge">
                          {item.stock > 0 ? 'In stock' : 'Out of stock'}
                        </span>
                      </td>
                      <td className="price">{renderPrice(item.price)}</td>
                      <td className="actions">
                        <div className="action-buttons">
                          <button
                            className="remove-btn"
                            onClick={() => handleRemoveComponent(component.id, index)}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Only show "Add Another" button when at least one component is selected */}
                  {component.selected.length > 0 && (
                    <tr className="add-another-row">
                      <td colSpan="5" className="add-another-cell">
                        <button
                          className="add-another-btn"
                          onClick={() => handleCategoryClick(component.id)}
                        >
                          Add another {component.name}
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              ) : (
                // Handling for components that can only be selected once (CPU, Mainboard, etc.)
                <tr className="component-row">
                  <td className="component-name">
                    <div>
                      <span className="component-icon">{component.icon}</span>
                      {component.name}
                    </div>
                  </td>
                  <td className="selection">
                    {component.selected ? (
                      <div
                        className="selected-component"
                        onClick={() => navigate(`/product-info/${component.selected.product_id || component.selected.id}`)}
                      >
                        <img src={component.selected.image} alt={component.selected.name} />
                        <span>{component.selected.title}</span>
                      </div>
                    ) : (
                      <button
                        className="choose-btn"
                        onClick={() => handleCategoryClick(component.id)}
                      >
                        Choose {component.name}
                      </button>
                    )}
                  </td>
                  <td className={`availability ${component.selected ? (component.selected.stock > 0 ? 'in-stock' : 'out-of-stock') : ''}`}>
                    {component.selected ? (
                      <span className="availability-badge">
                        {component.selected.stock > 0 ? 'In stock' : 'Out of stock'}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="price">
                    {component.selected ? renderPrice(component.selected.price) : '—'}
                  </td>
                  <td className="actions">
                    {component.selected && (
                      <div className="action-buttons">
                        <button
                          className="remove-btn"
                          onClick={() => handleRemoveComponent(component.id)}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {/* <div className="additional-components">
        <div className="component-group">
          <div className="group-title">
            <span className="group-icon">🔌</span>
            Expansion / Networking
          </div>
          <div className="group-items">
            {expansionItems.map(item => (
              <span key={item} className="group-item">
                <a href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}>{item}</a>
              </span>
            ))}
          </div>
        </div>

        <div className="component-group">
          <div className="group-title">
            <span className="group-icon">🖱️</span>
            Peripherals
          </div>
          <div className="group-items">
            {peripherals.map(item => (
              <span key={item} className="group-item">
                <a href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}>{item}</a>
              </span>
            ))}
          </div>
        </div>

        <div className="component-group">
          <div className="group-title">
            <span className="group-icon">🔧</span>
            Accessories / Other
          </div>
          <div className="group-items">
            {accessories.map(item => (
              <span key={item} className="group-item">
                <a href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}>{item}</a>
              </span>
            ))}
          </div>
        </div>
      </div> */}

      <div className="total-section">
        <div className="total-label">Total:</div>
        <div className="total-price">{renderPrice(totalPrice)}</div>
      </div>      <div className="checkout-section">
        {/* <button className="save-build-btn-bottom" onClick={handleOpenSaveModal}>
          <FaSave style={{ marginRight: '6px' }} />
          Save Build
        </button> */}
        <button className="amazon-buy-btn" onClick={handleBuyNow}>
          <span className="checkout-icon"><FaShoppingCart /></span>
          Buy Complete Build
        </button>
        {/* Debug button - only show in development */}
        {process.env.NODE_ENV === 'development' && (
          <button
            className="amazon-buy-btn"
            onClick={clearAllComponents}
            style={{ marginLeft: '10px', backgroundColor: '#ff6b6b' }}
          >
            <FaTrash style={{ marginRight: '6px' }} /> Clear All
          </button>
        )}
      </div>

      {/* Compatibility issues section */}
      <div className="compatibility-issues" id="notes">
        <h2>Potential Issues / Incompatibilities</h2>

        <div className="issues-container">
          {compatibilityIssues.map((issue, index) => (
            <div key={index} className={`issue-item ${issue.type}`}>
              <div className="issue-badge">{issue.type === 'problem' ? 'P' : 'I'}</div>
              <div className="issue-content">
                <div className="issue-type">
                  {issue.type === 'problem' ? 'Problem:' : 'Note:'}
                </div>
                <div className="issue-message">
                  {issue.message}
                </div>
              </div>
            </div>
          ))}

          {compatibilityIssues.length === 0 && (
            <div className="no-issues">
              <div className="success-icon"><FaCheck /></div>
              <p>No compatibility issues detected!</p>
            </div>
          )}
        </div>
      </div>

      {/* Motherboard Usage Component */}
      <MotherboardUsage
        motherboard={selectedMainboard}
        rams={selectedRams}
        cpu={selectedCpu}
        storages={selectedStorages}
        gpus={selectedGpus}
        components={components}
      />

      {/* ── Save Build Modal ── */}
      {showSaveModal && (
        <div className="save-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="save-modal" onClick={e => e.stopPropagation()}>
            <div className="save-modal-header">
              <h2><FaSave style={{ marginRight: '8px' }} />Save Build</h2>
              <button className="modal-close-btn" onClick={() => setShowSaveModal(false)}><FaTimes /></button>
            </div>

            {saveSuccess ? (
              <div className="save-success">
                <FaCheck className="success-check" />
                <p>{saveSuccess}</p>
                <button className="modal-done-btn" onClick={() => setShowSaveModal(false)}>Done</button>
              </div>
            ) : (
              <>
                <div className="save-modal-body">
                  <label htmlFor="build-name">Build Name <span className="required">*</span></label>
                  <input
                    id="build-name"
                    type="text"
                    value={saveBuildName}
                    onChange={e => setSaveBuildName(e.target.value)}
                    placeholder="e.g. My Gaming Rig"
                    maxLength={255}
                    autoFocus
                  />

                  <label htmlFor="build-desc">Description</label>
                  <textarea
                    id="build-desc"
                    value={saveBuildDesc}
                    onChange={e => setSaveBuildDesc(e.target.value)}
                    placeholder="Optional notes about this build..."
                    rows={3}
                  />

                  <div className="visibility-toggle">
                    <label>Visibility</label>
                    <div className="toggle-options">
                      <button
                        className={`toggle-opt ${saveBuildPublic ? 'selected' : ''}`}
                        onClick={() => setSaveBuildPublic(true)}
                      >
                        <FaGlobe style={{ marginRight: '4px' }} /> Public
                      </button>
                      <button
                        className={`toggle-opt ${!saveBuildPublic ? 'selected' : ''}`}
                        onClick={() => setSaveBuildPublic(false)}
                      >
                        <FaLock style={{ marginRight: '4px' }} /> Private
                      </button>
                    </div>
                  </div>

                  {saveError && <div className="save-error">{saveError}</div>}
                </div>
                <div className="save-modal-footer">
                  <button className="cancel-btn" onClick={() => setShowSaveModal(false)}>Cancel</button>
                  <button
                    className="confirm-save-btn"
                    onClick={handleSaveBuild}
                    disabled={saveLoading}
                  >
                    {saveLoading ? 'Saving...' : 'Save Build'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );


  // Helper function to format price
  function renderPrice(price) {
    console.log('Price:', price);
    if (!price) return '—';
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Function to calculate estimated wattage (synced with MotherboardUsage)
  function calculateWattage() {
    let totalWattage = 0;

    const cpu = components.find(c => c.id === 'cpu')?.selected;
    const cpuCooler = components.find(c => c.id === 'cpu Cooler')?.selected;
    const mainboard = components.find(c => c.id === 'Mainboard')?.selected;
    const rams = components.find(c => c.id === 'ram')?.selected || [];
    const storages = components.find(c => c.id === 'storage')?.selected || [];
    const gpus = components.find(c => c.id === 'gpu')?.selected || [];

    // CPU power consumption
    if (cpu) {
      const tdpValue = cpu.attributes?.['TDP'];
      if (tdpValue) {
        const wattage = parseInt(tdpValue.toString().replace(/\D/g, '')) || 95;
        totalWattage += wattage;
      } else {
        totalWattage += 95; // Default CPU power
      }
    }

    // Motherboard base power consumption
    if (mainboard) {
      totalWattage += 50;
    }

    // CPU Cooler power consumption
    if (cpuCooler) {
      totalWattage += 15;
    }

    // RAM power consumption (approximately 3-5W per module)
    rams.forEach(ram => {
      const moduleCount = getModuleCount(ram);
      totalWattage += moduleCount * 4; // 4W per RAM module
    });

    // Storage power consumption
    storages.forEach(storage => {
      const interfaceType = storage.attributes?.["Interface"] || '';
      if (interfaceType.includes('M.2')) {
        totalWattage += 8; // M.2 NVMe SSD
      } else if (interfaceType.includes('SATA')) {
        if (storage.attributes?.["Type"]?.includes('SSD')) {
          totalWattage += 5; // SATA SSD
        } else {
          totalWattage += 10; // SATA HDD
        }
      } else {
        totalWattage += 8; // Default storage power
      }
    });

    // GPU power consumption
    gpus.forEach(gpu => {
      const tdpValue = gpu.attributes?.['TDP'] || gpu.attributes?.['Power Consumption'];
      if (tdpValue) {
        const wattage = parseInt(tdpValue.toString().replace(/\D/g, '')) || 150;
        totalWattage += wattage;
      } else {
        // Estimate based on memory if TDP not available
        const memory = parseInt(gpu.attributes?.["Memory"] || '0');
        if (memory >= 16) {
          totalWattage += 300; // High-end GPU
        } else if (memory >= 8) {
          totalWattage += 220; // Mid-range GPU
        } else if (memory >= 4) {
          totalWattage += 150; // Entry-level GPU
        } else {
          totalWattage += 75; // Basic GPU
        }
      }
    });

    return totalWattage;
  }

  // Helper function to format RAM display text with modules
  function formatRAMDisplayText(ram) {
    if (!ram) return '';

    const baseTitle = ram.title || ram.name || '';
    const modules = ram.attributes?.["Modules"];

    if (modules) {
      return `${baseTitle} (${modules})`;
    }

    return baseTitle;
  }
};

export default Build;