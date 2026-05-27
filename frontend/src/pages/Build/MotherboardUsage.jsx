import React, { useState, useEffect } from 'react';
import './MotherboardUsage.css';
import {
  FaMicrochip,
  FaMemory,
  FaHdd,
  FaDatabase,
  FaTv,
  FaPlug,
  FaLightbulb,
  FaCheck
} from 'react-icons/fa';

function countM2slot(input) {
  if (!input) return 0;
  return input.split(',').length;
}

function getSataPorts(motherboard) {
  if (!motherboard || !motherboard.attributes) return 0;
  const sataPorts = motherboard.attributes["SATA 6.0 Gb/s"];
  return sataPorts ? parseInt(sataPorts, 10) : 0;
}

function categorizeStorageDevices(storages) {
  const result = {
    m2Devices: [],
    sataDevices: []
  };

  storages.forEach(storage => {
    if (!storage || !storage.attributes) return;

    const interfaceType = storage.attributes["Interface"] || '';

    if (interfaceType.includes('M.2') && !interfaceType.includes('SATA')) {
      result.m2Devices.push(storage);
    }
    else if (interfaceType.includes('SATA')) {
      result.sataDevices.push(storage);
    }
    else {
      result.sataDevices.push(storage);
    }
  });

  return result;
}

function getModuleCount(ram) {
  if (!ram || !ram.attributes || !ram.attributes["Modules"]) return 1;

  const modulesStr = ram.attributes["Modules"];
  const match = modulesStr.match(/^(\d+)\s*x/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return 1;
}

function getModuleCapacity(ram) {
  if (!ram || !ram.attributes || !ram.attributes["Modules"]) return 'N/A';

  const modulesStr = ram.attributes["Modules"];
  // Extract capacity part (e.g., '32GB' from '2 x 32GB')
  const match = modulesStr.match(/(\d+\s*[GMK]B)/i);
  if (match && match[1]) {
    return match[1].replace(/\s+/g, '');
  }
  return modulesStr;
}

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

// New compatibility assessment functions
function checkCPUCompatibility(motherboard, cpu) {
  if (!cpu || !motherboard) return { compatible: false, message: 'CPU or motherboard not selected' };

  const mbSocket = motherboard.attributes?.["Socket/CPU"] || '';
  const cpuSocket = cpu.attributes?.["Socket"] || cpu.attributes?.["Socket/CPU"] || '';

  if (!mbSocket || !cpuSocket) {
    return { compatible: false, message: 'Socket information not available' };
  }

  const compatible = mbSocket.toLowerCase().includes(cpuSocket.toLowerCase()) ||
    cpuSocket.toLowerCase().includes(mbSocket.toLowerCase());

  return {
    compatible,
    message: compatible ? `CPU compatible with ${mbSocket} socket` : `CPU socket ${cpuSocket} incompatible with motherboard socket ${mbSocket}`
  };
}

function checkRAMCompatibility(motherboard, rams) {
  if (!motherboard) return { compatible: false, message: 'Motherboard not selected', issues: [] };

  // Check if any RAM is selected
  if (!rams || rams.length === 0) {
    return { compatible: false, message: 'RAM not selected', issues: [], moduleCount: 0, slotCount: 0 };
  }

  const mbRamSlots = parseInt(motherboard.attributes?.["Memory Slots"] || '0');
  const mbRamType = motherboard.attributes?.["Memory Type"] || '';
  const mbMaxMemory = parseInt(motherboard.attributes?.["Maximum Memory"] || '0');

  let totalModules = 0;
  let totalCapacity = 0;
  const issues = [];
  let allCompatible = true;

  rams.forEach(ram => {
    if (!ram) return;

    const moduleCount = getModuleCount(ram);
    totalModules += moduleCount;

    const ramType = ram.attributes?.["Type"] || '';
    const capacity = parseInt(ram.attributes?.["Capacity"] || '0');
    totalCapacity += capacity;

    // Check RAM type compatibility
    if (mbRamType && ramType && !ramType.toLowerCase().includes(mbRamType.toLowerCase())) {
      issues.push(`${ram.title}: ${ramType} incompatible with motherboard ${mbRamType}`);
      allCompatible = false;
    }
  });

  // Check slot count
  if (totalModules > mbRamSlots) {
    issues.push(`Too many RAM modules: ${totalModules} modules for ${mbRamSlots} slots`);
    allCompatible = false;
  }

  // Check maximum memory
  if (mbMaxMemory > 0 && totalCapacity > mbMaxMemory) {
    issues.push(`Total memory ${totalCapacity}GB exceeds motherboard limit ${mbMaxMemory}GB`);
    allCompatible = false;
  }

  return {
    compatible: allCompatible && totalModules <= mbRamSlots,
    message: allCompatible ? `RAM configuration valid (${totalModules}/${mbRamSlots} slots used)` : 'RAM compatibility issues detected',
    issues,
    moduleCount: totalModules,
    slotCount: mbRamSlots
  };
}

function checkStorageCompatibility(motherboard, storages) {
  if (!motherboard) return { compatible: false, message: 'Motherboard not selected', issues: [] };

  // Check if any storage is selected
  if (!storages || storages.length === 0) {
    return { compatible: false, message: 'Storage not selected', issues: [], m2Usage: '0/0', sataUsage: '0/0' };
  }

  const m2Slots = countM2slot(motherboard.attributes?.["M.2 Slots"]);
  const sataPorts = getSataPorts(motherboard);
  const { m2Devices, sataDevices } = categorizeStorageDevices(storages);

  const issues = [];
  let compatible = true;

  if (m2Devices.length > m2Slots) {
    issues.push(`Too many M.2 devices: ${m2Devices.length} devices for ${m2Slots} slots`);
    compatible = false;
  }

  if (sataDevices.length > sataPorts) {
    issues.push(`Too many SATA devices: ${sataDevices.length} devices for ${sataPorts} ports`);
    compatible = false;
  }

  return {
    compatible,
    message: compatible ? 'Storage configuration valid' : 'Storage compatibility issues detected',
    issues,
    m2Usage: `${m2Devices.length}/${m2Slots}`,
    sataUsage: `${sataDevices.length}/${sataPorts}`
  };
}

function checkGPUCompatibility(motherboard, gpus) {
  if (!motherboard) return { compatible: false, message: 'Motherboard not selected', issues: [] };

  // Check if any GPU is selected - GPU is optional, so return compatible
  if (!gpus || gpus.length === 0) {
    return {
      compatible: true,
      message: 'No GPU selected (integrated graphics assumed)',
      issues: [],
      gpuCount: 0,
      x16SlotCount: parseInt(motherboard.attributes?.["PCIe x16 Slots"] || '0')
    };
  }

  const pcieX16Slots = parseInt(motherboard.attributes?.["PCIe x16 Slots"] || '0');
  const pcieX1Slots = parseInt(motherboard.attributes?.["PCIe x1 Slots"] || '0');
  const { x16GPUs, x8GPUs, x4GPUs } = categorizeGPUs(gpus);

  const issues = [];
  let compatible = true;
  const totalGPUs = gpus.length;

  // Check if high-end GPUs can fit in x16 slots
  if (x16GPUs.length > pcieX16Slots) {
    issues.push(`High-end GPUs require x16 slots: ${x16GPUs.length} GPUs for ${pcieX16Slots} x16 slots`);
    compatible = false;
  }

  // Check total GPU count vs available slots
  const totalSlots = pcieX16Slots + pcieX1Slots;
  if (totalGPUs > totalSlots) {
    issues.push(`Too many GPUs: ${totalGPUs} GPUs for ${totalSlots} total PCIe slots`);
    compatible = false;
  }

  // Check power and size considerations
  if (totalGPUs > 1) {
    issues.push('Multiple GPUs may require additional power and cooling considerations');
  }

  return {
    compatible,
    message: compatible ? `GPU configuration valid (${totalGPUs}/${pcieX16Slots} x16 slots used)` : 'GPU compatibility issues detected',
    issues,
    gpuCount: totalGPUs,
    x16SlotCount: pcieX16Slots
  };
}

function calculateOverallCompatibility(cpuCheck, ramCheck, storageCheck, gpuCheck, powerCheck, coolerCheck) {
  const checks = [cpuCheck, ramCheck, storageCheck, gpuCheck, powerCheck, coolerCheck];

  // Calculate number of components that are actually relevant
  const relevantChecks = checks.filter(check => {
    // Skip GPU check if no GPU was selected (integrated graphics can be used)
    if (check === gpuCheck && gpuCheck.gpuCount === 0) {
      return false;
    }
    return true;
  });

  // Calculate number of compatible components among relevant ones
  const compatibleCount = relevantChecks.filter(check => check.compatible).length;
  const totalChecks = relevantChecks.length;

  const score = totalChecks > 0 ? (compatibleCount / totalChecks) * 100 : 0;
  const starRating = Math.ceil((score / 100) * 5);

  let ratingText = '';
  let ratingClass = '';

  if (score >= 90) {
    ratingText = 'Excellent';
    ratingClass = 'excellent';
  } else if (score >= 75) {
    ratingText = 'Very Good';
    ratingClass = 'very-good';
  } else if (score >= 60) {
    ratingText = 'Good';
    ratingClass = 'good';
  } else if (score >= 40) {
    ratingText = 'Fair';
    ratingClass = 'fair';
  } else {
    ratingText = 'Poor';
    ratingClass = 'poor';
  }

  return {
    score,
    starRating,
    ratingText,
    ratingClass,
    compatibleCount,
    totalChecks
  };
}

// New CPU cooler compatibility assessment function
function checkCPUCoolerCompatibility(cpu, cpuCooler, motherboard) {
  if (!cpuCooler) {
    return {
      compatible: false,
      message: 'CPU cooler not selected',
      issues: [], // Removed duplicate issue here
      thermalRating: 'N/A'
    };
  }

  if (!cpu) {
    return {
      compatible: false,
      message: 'CPU not selected for cooler compatibility check',
      issues: [], // Removed duplicate issue here
      thermalRating: 'N/A'
    };
  }

  const issues = [];
  let compatible = true;

  // Get CPU socket and TDP
  const cpuSocket = cpu.attributes?.["Socket"] || cpu.attributes?.["Socket/CPU"] || '';
  const cpuTDP = parseInt(cpu.attributes?.["TDP"]?.toString().replace(/\D/g, '')) || 95;

  // Get cooler socket compatibility
  const coolerSockets = cpuCooler.attributes?.["CPU Socket"] ||
    cpuCooler.attributes?.["Socket"] ||
    cpuCooler.attributes?.["Compatibility"] || '';

  // Check socket compatibility
  let socketCompatible = false;
  if (coolerSockets && cpuSocket) {
    // Check if CPU socket is mentioned in cooler compatibility
    socketCompatible = coolerSockets.toLowerCase().includes(cpuSocket.toLowerCase()) ||
      cpuSocket.toLowerCase().includes(coolerSockets.toLowerCase());

    // Additional checks for common socket families
    if (!socketCompatible) {
      // AMD socket compatibility
      if ((cpuSocket.includes('AM4') || cpuSocket.includes('AM5')) &&
        (coolerSockets.includes('AM4') || coolerSockets.includes('AM5'))) {
        socketCompatible = true;
      }
      // Intel socket compatibility  
      if ((cpuSocket.includes('LGA') && coolerSockets.includes('LGA')) ||
        (cpuSocket.includes('1700') && coolerSockets.includes('1700')) ||
        (cpuSocket.includes('1200') && coolerSockets.includes('1200'))) {
        socketCompatible = true;
      }
    }
  }

  if (!socketCompatible) {
    issues.push(`CPU cooler socket incompatible: ${coolerSockets || 'Unknown'} cooler with ${cpuSocket} CPU`);
    compatible = false;
  }

  // Check thermal capacity
  const coolerTDP = 200;

  let thermalRating = 'Unknown';
  if (coolerTDP > 0) {
    if (coolerTDP < cpuTDP * 0.8) {
      issues.push(`CPU cooler insufficient: ${coolerTDP}W cooler for ${cpuTDP}W CPU (below 80% capacity)`);
      compatible = false;
      thermalRating = 'Insufficient';
    } else if (coolerTDP < cpuTDP) {
      issues.push(`CPU cooler marginally adequate: ${coolerTDP}W cooler for ${cpuTDP}W CPU`);
      thermalRating = 'Marginal';
    } else if (coolerTDP >= cpuTDP * 1.5) {
      thermalRating = 'Excellent';
    } else if (coolerTDP >= cpuTDP * 1.2) {
      thermalRating = 'Very Good';
    } else {
      thermalRating = 'Adequate';
    }
  }

  // Check cooler type and CPU requirements
  const coolerType = cpuCooler.attributes?.["Type"] || cpuCooler.attributes?.["Cooler Type"] || '';
  if (cpuTDP > 125 && coolerType.toLowerCase().includes('stock')) {
    issues.push(`High-performance CPU (${cpuTDP}W) may require aftermarket cooling solution`);
  }

  // Check motherboard clearance if available
  if (motherboard) {
    const maxCoolerHeight = parseInt(motherboard.attributes?.["Max CPU Cooler Height"]?.toString().replace(/\D/g, '')) || 0;
    const coolerHeight = parseInt(cpuCooler.attributes?.["Height"]?.toString().replace(/\D/g, '')) || 0;

    if (maxCoolerHeight > 0 && coolerHeight > 0 && coolerHeight > maxCoolerHeight) {
      issues.push(`CPU cooler too tall: ${coolerHeight}mm cooler exceeds ${maxCoolerHeight}mm clearance`);
      compatible = false;
    }
  }

  let message = '';
  if (compatible) {
    if (socketCompatible && thermalRating === 'Excellent') {
      message = `CPU cooler excellent match (${thermalRating} thermal capacity, socket compatible)`;
    } else if (socketCompatible && (thermalRating === 'Very Good' || thermalRating === 'Adequate')) {
      message = `CPU cooler compatible (${thermalRating} thermal capacity, socket compatible)`;
    } else {
      message = `CPU cooler compatible with minor considerations`;
    }
  } else {
    message = 'CPU cooler compatibility issues detected';
  }

  return {
    compatible,
    message,
    issues,
    thermalRating,
    cpuTDP,
    coolerTDP,
    socketCompatible
  };
}

// New power consumption assessment functions
function calculateSystemPowerConsumption(cpu, motherboard, rams, storages, gpus, cpuCooler) {
  let totalWattage = 0;

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
  if (motherboard) {
    totalWattage += 50; // Motherboard + chipset
  }

  // CPU Cooler power consumption
  if (cpuCooler) {
    totalWattage += 15; // Average cooler power
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

  // Add system overhead (fans, peripherals, etc.)
  // totalWattage += 50;

  return Math.ceil(totalWattage);
}

function checkPowerCompatibility(psu, systemPowerConsumption) {
  if (!psu) {
    return {
      compatible: false,
      message: 'PSU not selected',
      issues: [], // Removed duplicate issue here
      systemPower: systemPowerConsumption,
      psuPower: 0,
      efficiency: 'N/A'
    };
  }

  // Extract PSU wattage from title or attributes
  let psuWattage = 0;
  const wattageFromTitle = psu.title?.match(/(\d+)W/i);
  const wattageFromAttrs = psu.attributes?.["Wattage"] || psu.attributes?.["Power"];

  if (wattageFromAttrs) {
    psuWattage = parseInt(wattageFromAttrs.toString().replace(/\D/g, '')) || 0;
  } else if (wattageFromTitle) {
    psuWattage = parseInt(wattageFromTitle[1]) || 0;
  }

  if (psuWattage === 0) {
    return {
      compatible: false,
      message: 'PSU wattage information not available',
      issues: ['Unable to determine PSU power rating'],
      systemPower: systemPowerConsumption,
      psuPower: 0,
      efficiency: 'Unknown'
    };
  }

  const issues = [];
  let compatible = true;

  // Calculate recommended PSU wattage (system power + 20-30% headroom)
  const recommendedWattage = Math.ceil(systemPowerConsumption * 1.25);
  const idealWattage = Math.ceil(systemPowerConsumption * 1.5);

  // Check if PSU can handle the load
  if (psuWattage < systemPowerConsumption) {
    issues.push(`PSU insufficient: ${psuWattage}W PSU cannot handle ${systemPowerConsumption}W system load`);
    compatible = false;
  } else if (psuWattage < recommendedWattage) {
    issues.push(`PSU marginally adequate: ${psuWattage}W PSU with ${systemPowerConsumption}W load leaves minimal headroom`);
    compatible = false;
  } else if (psuWattage > idealWattage * 2) {
    issues.push(`PSU oversized: ${psuWattage}W PSU may be inefficient for ${systemPowerConsumption}W system`);
  }

  // Check PSU efficiency
  const efficiency = psu.attributes?.["Efficiency"] || psu.attributes?.["80 Plus"] || 'Standard';

  // Calculate load percentage
  const loadPercentage = (systemPowerConsumption / psuWattage * 100).toFixed(1);

  let message = '';
  if (compatible) {
    if (psuWattage >= idealWattage) {
      message = `PSU excellent for system (${loadPercentage}% load, ${efficiency} efficiency)`;
    } else {
      message = `PSU adequate for system (${loadPercentage}% load, ${efficiency} efficiency)`;
    }
  } else {
    message = 'PSU power compatibility issues detected';
  }

  return {
    compatible,
    message,
    issues,
    systemPower: systemPowerConsumption,
    psuPower: psuWattage,
    loadPercentage: parseFloat(loadPercentage),
    efficiency,
    recommendedWattage,
    idealWattage
  };
}

const MotherboardUsage = ({ motherboard, rams, cpu, storages, gpus, components }) => {
  const [animateSection, setAnimateSection] = useState(null);

  useEffect(() => {
    const sections = ['cpu', 'ram', 'storage', 'expansion'];
    let currentIndex = 0;

    const intervalId = setInterval(() => {
      setAnimateSection(sections[currentIndex]);
      currentIndex = (currentIndex + 1) % sections.length;

      setTimeout(() => {
        setAnimateSection(null);
      }, 700);
    }, 3000);

    return () => clearInterval(intervalId);
  }, []);

  if (!motherboard) {
    return (
      <div className="motherboard-usage motherboard-empty">
        <h2>Motherboard Usage</h2>
        <div className="empty-state">
          <p>Select a motherboard to view component compatibility and positioning.</p>
        </div>
      </div>
    );
  }

  const ramSlots = motherboard.attributes?.["Memory Slots"] || 3;
  const m2Slots = countM2slot(motherboard.attributes?.["M.2 Slots"]);
  const pcieX16Slots = motherboard.attributes?.["PCIe x16 Slots"] || 2;
  const pcieX1Slots = motherboard.attributes?.["PCIe x1 Slots"] || 0;
  const socketType = motherboard.attributes?.["Socket/CPU"] || "Unknown";
  const memoryType = motherboard.attributes?.["Memory Type"] || "DDR4";
  const sataPorts = getSataPorts(motherboard);

  const m2SlotSpecs = motherboard.attributes?.["M.2 Slots"] || "M";
  const m2SlotTypes = m2SlotSpecs.split(',').map(slot => slot.trim());

  const sataVersion = motherboard.attributes?.["SATA 6.0 Gb/s"] ? "6.0 Gb/s" : "3.0 Gb/s";

  const ramModules = [];
  let currentSlotIndex = 0;
  let numberOfRams = 0;
  for (const ram of rams) {
    const moduleCount = getModuleCount(ram);

    for (let i = 0; i < moduleCount; i++) {
      if (currentSlotIndex < ramSlots) {
        ramModules[currentSlotIndex] = ram;
        currentSlotIndex++;
        numberOfRams++;
      }
    }
  }

  while (currentSlotIndex < ramSlots) {
    ramModules[currentSlotIndex] = null;
    currentSlotIndex++;
  }

  const { m2Devices, sataDevices } = categorizeStorageDevices(storages);
  const { x16GPUs, x8GPUs, x4GPUs } = categorizeGPUs(gpus);

  // Assign GPUs to slots
  const assignedX16Slots = [];
  const assignedX1Slots = [];

  // Fill x16 slots first with high-end GPUs
  x16GPUs.forEach((gpu, index) => {
    if (index < pcieX16Slots) {
      assignedX16Slots[index] = gpu;
    }
  });

  // Fill remaining x16 slots with mid-range GPUs
  let x16SlotIndex = x16GPUs.length;
  x8GPUs.forEach(gpu => {
    if (x16SlotIndex < pcieX16Slots) {
      assignedX16Slots[x16SlotIndex] = gpu;
      x16SlotIndex++;
    } else if (assignedX1Slots.length < pcieX1Slots) {
      assignedX1Slots.push(gpu);
    }
  });

  // Fill x1/x4 slots with remaining GPUs
  x4GPUs.forEach(gpu => {
    if (assignedX1Slots.length < pcieX1Slots) {
      assignedX1Slots.push(gpu);
    }
  });

  const getSafeImage = (item, defaultImage) => {
    try {
      return item?.image || defaultImage;
    } catch (error) {
      console.error("Error accessing image property:", error);
      return defaultImage;
    }
  };

  const getSafeName = (item, type) => {
    try {
      return item?.title || `Unknown ${type}`;
    } catch (error) {
      console.error(`Error accessing title for ${type}:`, error);
      return `Unknown ${type}`;
    }
  };

  const isPCIeSlotCovered = (slotIndex, slotType) => {
    // Disabled the covered logic per user request
    return false;
  };

  // Get additional components for power calculation
  const cpuCooler = components?.find(c => c.id === 'cpu Cooler')?.selected || null;
  const psu = components?.find(c => c.id === 'psu')?.selected || null;

  // Calculate system power consumption
  const systemPowerConsumption = calculateSystemPowerConsumption(
    cpu, motherboard, rams || [], storages || [], gpus || [], cpuCooler
  );

  // Calculate compatibility assessments
  const cpuCompatibility = cpu ? checkCPUCompatibility(motherboard, cpu) :
    { compatible: false, message: 'CPU not selected', issues: [] };

  const ramCompatibility = checkRAMCompatibility(motherboard, rams || []);
  const storageCompatibility = checkStorageCompatibility(motherboard, storages || []);
  const gpuCompatibility = checkGPUCompatibility(motherboard, gpus || []);
  const powerCompatibility = psu ? checkPowerCompatibility(psu, systemPowerConsumption) :
    { compatible: false, message: 'PSU not selected', issues: [], systemPower: systemPowerConsumption, psuPower: 0 };
  const coolerCompatibility = cpu && cpuCooler ? checkCPUCoolerCompatibility(cpu, cpuCooler, motherboard) :
    { compatible: false, message: 'CPU cooler not selected or CPU not selected', issues: [], thermalRating: 'N/A' };

  const overallRating = calculateOverallCompatibility(
    cpuCompatibility,
    ramCompatibility,
    storageCompatibility,
    gpuCompatibility,
    powerCompatibility,
    coolerCompatibility
  );

  return (
    <div className="motherboard-usage">
      <h2>Motherboard Compatibility Diagram</h2>

      <div className="motherboard-header">
        <div className="mb-image-container">
          <img
            src={getSafeImage(motherboard, "/images/motherboard-placeholder.png")}
            alt="Motherboard"
            className="mb-image"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = "/images/motherboard-placeholder.png";
            }}
          />
        </div>
        <div className="mb-title">
          {getSafeName(motherboard, "Motherboard")}
          <div className="mb-subtitle">{motherboard.attributes?.["Chipset"] || 'Unknown Chipset'}</div>
        </div>
      </div>

      <div className={`mb-layout ${animateSection === 'cpu' || animateSection === 'ram' ? 'highlight-section' : ''}`}>
        <div className="mb-section">
          <div className="section-header">
            <FaMicrochip className="section-icon" /> CPU Socket
          </div>
          <div className="section-content">
            <div className="socket-item">
              <div className="socket-label">CPU_1 ({socketType})</div>
              <div className="socket-connection"></div>
              {cpu ? (
                <div className="component-item">
                  <img
                    src={getSafeImage(cpu, "/images/cpu-placeholder.png")}
                    alt="CPU"
                    className="component-image"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = "/images/cpu-placeholder.png";
                    }}
                  />
                  <div className="component-name">
                    {getSafeName(cpu, "CPU")}
                  </div>
                </div>
              ) : (
                <div className="component-empty">No CPU selected</div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-section">
          <div className="section-header">
            <FaMemory className="section-icon" /> Memory Slots ({ramSlots} slots)
          </div>
          <div className="section-content">
            {Array.from({ length: ramSlots }, (_, index) => (
              <div className="memory-item" key={`ram-${index}`}>
                <div className="memory-label">RAM_{index + 1} ({memoryType})</div>
                <div className="memory-connection"></div>
                {ramModules && index < ramModules.length && ramModules[index] ? (
                  <div className="component-item">
                    <img
                      src={getSafeImage(ramModules[index], "/images/ram-placeholder.png")}
                      alt="RAM"
                      className="component-image"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/images/ram-placeholder.png";
                      }}
                    />
                    <div className="component-name">
                      {getSafeName(ramModules[index], "RAM")}
                      <div className="component-specs">
                        {getModuleCapacity(ramModules[index])}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="component-empty">No RAM selected</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* <div className="mb-note">
        <FaLightbulb className="note-icon" />
        The number of RAM slots may vary depending on the motherboard. Please refer to the motherboard manual for optimal RAM installation.
      </div> */}

      <div className={`mb-layout ${animateSection === 'storage' ? 'highlight-section' : ''}`}>
        <div className="mb-section">
          <div className="section-header">
            <FaHdd className="section-icon" /> M.2 NVMe Slots ({m2Slots} slots)
          </div>
          <div className="section-content">
            {Array.from({ length: m2Slots }, (_, index) => {
              const m2Storage = index < m2Devices.length ? m2Devices[index] : null;

              return (
                <div className="slot-item" key={`m2-${index}`}>
                  <div className="slot-label">M2_{index + 1} ({m2SlotTypes[index] || 'M'})</div>
                  <div className="slot-connection"></div>
                  {m2Storage ? (
                    <div className="component-item">
                      <img
                        src={getSafeImage(m2Storage, "/images/m2-placeholder.png")}
                        alt="M.2 SSD"
                        className="component-image"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "/images/m2-placeholder.png";
                        }}
                      />
                      <div className="component-name">
                        {getSafeName(m2Storage, "SSD")}
                        <div className="component-specs">
                          {m2Storage.attributes?.["Capacity"] || 'N/A'}, {m2Storage.attributes?.["Interface"] || 'N/A'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="component-empty">No M.2 SSD selected</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-section">
          <div className="section-header">
            <FaDatabase className="section-icon" /> SATA Ports ({sataPorts} ports)
          </div>
          <div className="section-content">
            {Array.from({ length: sataPorts }, (_, index) => {
              const sataStorage = index < sataDevices.length ? sataDevices[index] : null;

              return (
                <div className="memory-item" key={`sata${index}`}>
                  <div className="memory-label">SATA_{index + 1} ({sataVersion})</div>
                  <div className="memory-connection"></div>
                  {sataStorage ? (
                    <div className="component-item">
                      <img
                        src={getSafeImage(sataStorage, "/images/storage-placeholder.png")}
                        alt="SATA Storage"
                        className="component-image"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "/images/storage-placeholder.png";
                        }}
                      />
                      <div className="component-name">
                        {getSafeName(sataStorage, "Storage")}
                        <div className="component-specs">
                          {sataStorage.attributes?.["Capacity"] || 'N/A'}, {sataStorage.attributes?.["Interface"] || 'N/A'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="component-empty">No SATA device selected</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`mb-layout ${animateSection === 'expansion' ? 'highlight-section' : ''}`}>
        <div className="mb-section">
          <div className="section-header">
            <FaTv className="section-icon" /> PCIe x16 Slots ({pcieX16Slots} slots)
          </div>
          <div className="section-content">
            {Array.from({ length: pcieX16Slots }, (_, index) => (
              <div className={`slot-item ${isPCIeSlotCovered(index, 'x16') && index > 0 ? 'covered' : ''}`} key={`pcie16-${index}`}>
                <div className="slot-label">PCIE_{index + 1} (x16)</div>
                <div className="slot-connection"></div>
                {assignedX16Slots[index] ? (
                  <div className="component-item">
                    <img
                      src={getSafeImage(assignedX16Slots[index], "/images/gpu-placeholder.png")}
                      alt="GPU"
                      className="component-image"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/images/gpu-placeholder.png";
                      }}
                    />
                    <div className="component-name">
                      {getSafeName(assignedX16Slots[index], "GPU")}
                      <div className="component-specs">
                        {assignedX16Slots[index].attributes?.["Memory"] || 'N/A'} GB VRAM
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="component-empty">
                    {isPCIeSlotCovered(index, 'x16') ? 'Slot covered by another GPU' : 'No PCIe device selected'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-section">
          <div className="section-header">
            <FaPlug className="section-icon" /> PCIe x1/x4 Slots ({pcieX1Slots} slots)
          </div>
          <div className="section-content">
            {Array.from({ length: pcieX1Slots }, (_, index) => (
              <div className={`slot-item ${isPCIeSlotCovered(index, 'x1') ? 'covered' : ''}`} key={`pcie1-${index}`}>
                <div className="slot-label">PCIE_{pcieX16Slots + index + 1} (x1)</div>
                <div className="slot-connection"></div>
                {assignedX1Slots[index] ? (
                  <div className="component-item">
                    <img
                      src={getSafeImage(assignedX1Slots[index], "/images/gpu-placeholder.png")}
                      alt="GPU"
                      className="component-image"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/images/gpu-placeholder.png";
                      }}
                    />
                    <div className="component-name">
                      {getSafeName(assignedX1Slots[index], "GPU")}
                      <div className="component-specs">
                        {assignedX1Slots[index].attributes?.["Memory"] || 'N/A'} GB VRAM
                      </div>
                    </div>
                  </div>
                ) : isPCIeSlotCovered(index, 'x1') ? (
                  <div className="component-empty">Slot covered by GPU</div>
                ) : (
                  <div className="component-empty">No expansion card selected</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
{/* 
      <div className="motherboard-footer">
        <div className="power-summary">
          <div className="power-item">
            <div className="power-label">System Power Consumption</div>
            <div className="power-value">{systemPowerConsumption}W</div>
          </div>
          {psu && (
            <>
              <div className="power-item">
                <div className="power-label">PSU Rating</div>
                <div className="power-value">{powerCompatibility.psuPower}W</div>
              </div>
              <div className="power-item">
                <div className="power-label">PSU Load</div>
                <div className={`power-value ${powerCompatibility.loadPercentage > 80 ? 'high-load' : powerCompatibility.loadPercentage > 50 ? 'medium-load' : 'low-load'}`}>
                  {powerCompatibility.loadPercentage}%
                </div>
              </div>
              <div className="power-item">
                <div className="power-label">Efficiency Rating</div>
                <div className="power-value">{powerCompatibility.efficiency}</div>
              </div>
            </>
          )}
          {cpuCooler && (
            <>
              <div className="power-item">
                <div className="power-label">CPU TDP</div>
                <div className="power-value">{coolerCompatibility.cpuTDP || 'N/A'}W</div>
              </div>
              <div className="power-item">
                <div className="power-label">Cooler Capacity</div>
                <div className="power-value">{coolerCompatibility.coolerTDP || 'N/A'}W</div>
              </div>
              <div className="power-item">
                <div className="power-label">Thermal Rating</div>
                <div className={`power-value ${coolerCompatibility.thermalRating === 'Excellent' ? 'low-load' :
                  coolerCompatibility.thermalRating === 'Very Good' ? 'medium-load' :
                    coolerCompatibility.thermalRating === 'Insufficient' ? 'high-load' : ''
                  }`}>
                  {coolerCompatibility.thermalRating}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="compatibility-details">
          <div className={`detail-item ${cpuCompatibility.compatible ? 'compatible' : 'incompatible'}`}>
            <div className="detail-icon">
              {cpuCompatibility.compatible ? <FaCheck /> : <span>✕</span>}
            </div>
            <div className="detail-text">{cpuCompatibility.message}</div>
          </div>

          <div className={`detail-item ${coolerCompatibility.compatible ? 'compatible' : 'incompatible'}`}>
            <div className="detail-icon">
              {coolerCompatibility.compatible ? <FaCheck /> : <span>❄</span>}
            </div>
            <div className="detail-text">{coolerCompatibility.message}</div>
          </div>

          <div className={`detail-item ${ramCompatibility.compatible ? 'compatible' : 'incompatible'}`}>
            <div className="detail-icon">
              {ramCompatibility.compatible ? <FaCheck /> : <span>✕</span>}
            </div>
            <div className="detail-text">{ramCompatibility.message}</div>
          </div>

          <div className={`detail-item ${storageCompatibility.compatible ? 'compatible' : 'incompatible'}`}>
            <div className="detail-icon">
              {storageCompatibility.compatible ? <FaCheck /> : <span>✕</span>}
            </div>
            <div className="detail-text">{storageCompatibility.message}</div>
          </div>

          <div className={`detail-item ${gpuCompatibility.compatible ? 'compatible' : 'incompatible'}`}>
            <div className="detail-icon">
              {gpuCompatibility.compatible ? <FaCheck /> : <span>✕</span>}
            </div>
            <div className="detail-text">{gpuCompatibility.message}</div>
          </div>

          <div className={`detail-item ${powerCompatibility.compatible ? 'compatible' : 'incompatible'}`}>
            <div className="detail-icon">
              {powerCompatibility.compatible ? <FaCheck /> : <span>⚡</span>}
            </div>
            <div className="detail-text">{powerCompatibility.message}</div>
          </div>

          {[...ramCompatibility.issues, ...storageCompatibility.issues, ...gpuCompatibility.issues, ...powerCompatibility.issues, ...coolerCompatibility.issues].map((issue, index) => (
            <div key={index} className="detail-item incompatible warning">
              <div className="detail-icon warning">
                <span>⚠</span>
              </div>
              <div className="detail-text">{issue}</div>
            </div>
          ))}
        </div>
      </div> */}
    </div>
  );
};

export default MotherboardUsage;