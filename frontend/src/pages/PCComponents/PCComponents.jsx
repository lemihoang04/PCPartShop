import React from 'react';
import { useNavigate } from 'react-router-dom';
import './PCComponents.css';

const components = [
    {
        name: 'CPUs',
        slug: 'cpu',
        icon: 'fas fa-microchip',
        image: 'https://cdna.pcpartpicker.com/static/forever/img/nav-cpu-2023.png',
        series: 'Processors',
        description: 'Intel Core & AMD Ryzen desktop processors for gaming, workstation, and everyday builds.',
    },
    {
        name: 'CPU Coolers',
        slug: 'cpu cooler',
        icon: 'fas fa-fan',
        image: 'https://cdna.pcpartpicker.com/static/forever/img/nav-cpucooler-2023.png',
        series: 'Cooling',
        description: 'Air & AIO liquid coolers with RGB, radiator sizes from 120mm to 420mm.',
    },
    {
        name: 'Motherboards',
        slug: 'mainboard',
        icon: 'fas fa-server',
        image: 'https://cdna.pcpartpicker.com/static/forever/img/nav-motherboard-2023.png',
        series: 'Mainboards',
        description: 'ATX, Micro-ATX, and Mini-ITX boards for Intel & AMD platforms with the latest chipsets.',
    },
    {
        name: 'Memory',
        slug: 'ram',
        icon: 'fas fa-memory',
        image: 'https://cdna.pcpartpicker.com/static/forever/img/nav-memory-2023.png',
        series: 'RAM',
        description: 'DDR4 & DDR5 desktop memory kits with RGB lighting and high-speed XMP profiles.',
    },
    {
        name: 'Storage',
        slug: 'storage',
        icon: 'fas fa-hdd',
        image: 'https://cdna.pcpartpicker.com/static/forever/img/nav-ssd-2023.png',
        series: 'SSD & HDD',
        description: 'NVMe M.2 SSDs, SATA SSDs, and traditional hard drives for every capacity need.',
    },
    {
        name: 'Video Cards',
        slug: 'gpu',
        icon: 'fas fa-tv',
        image: 'https://cdna.pcpartpicker.com/static/forever/img/nav-videocard-2023.png',
        series: 'Graphics',
        description: 'NVIDIA GeForce & AMD Radeon GPUs for 1080p, 1440p, and 4K gaming.',
    },
    {
        name: 'Power Supplies',
        slug: 'psu',
        icon: 'fas fa-bolt',
        image: 'https://cdna.pcpartpicker.com/static/forever/img/nav-powersupply-2023.png',
        series: 'PSU',
        description: 'Bronze, Gold & Platinum certified, modular ATX 3.1, PCIe 5.1 ready.',
    },
    {
        name: 'Cases',
        slug: 'case',
        icon: 'fas fa-desktop',
        image: 'https://cdna.pcpartpicker.com/static/forever/img/nav-case-2023.png',
        series: 'Chassis',
        description: 'Mini-ITX to full tower, tempered glass, airflow-focused, and dual-chamber designs.',
    },
];

const PCComponents = () => {
    const navigate = useNavigate();

    return (
        <div className="pcc__container">
            <div className="pcc__content">
                {/* Page Header */}
                <div className="pcc__header">
                    <i className="fas fa-microchip pcc__header-icon"></i>
                    <h1 className="pcc__title">PC Components</h1>
                    <span className="pcc__item-count">{components.length} categories</span>
                </div>
                <p className="pcc__subtitle">
                    Browse all component categories to find the perfect parts for your build.
                </p>

                {/* Components Grid */}
                <div className="pcc__grid">
                    {components.map((comp) => (
                        <div
                            key={comp.slug}
                            className="pcc__card"
                            onClick={() => navigate(`/components/${comp.slug}`)}
                        >
                            <div className="pcc__card-image">
                                <img src={comp.image} alt={comp.name} />
                            </div>
                            <div className="pcc__card-body">
                                <h3 className="pcc__card-name">{comp.name}</h3>
                                <span className="pcc__card-series">{comp.series}</span>
                                <p className="pcc__card-desc">{comp.description}</p>
                                <div className="pcc__card-link">
                                    Explore {comp.name} <i className="fas fa-arrow-right"></i>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PCComponents;
