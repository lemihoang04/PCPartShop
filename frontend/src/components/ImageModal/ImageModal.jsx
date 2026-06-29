import React, { useState, useEffect } from 'react';
import { FaTimes, FaSearchPlus, FaSearchMinus, FaChevronLeft, FaChevronRight, FaUndo } from 'react-icons/fa';
import './ImageModal.css';

const ImageModal = ({ images, initialIndex = 0, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [zoom, setZoom] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') nextImage();
            if (e.key === 'ArrowLeft') prevImage();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex]);

    const resetView = () => {
        setZoom(1);
        setPosition({ x: 0, y: 0 });
    };

    const nextImage = () => {
        if (currentIndex < images.length - 1) {
            setCurrentIndex(prev => prev + 1);
            resetView();
        }
    };

    const prevImage = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            resetView();
        }
    };

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.5, 4));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.5, 0.5));

    const handleWheel = (e) => {
        if (e.deltaY < 0) handleZoomIn();
        else handleZoomOut();
    };

    const handleMouseDown = (e) => {
        if (zoom > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging && zoom > 1) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    if (!images || images.length === 0) return null;

    return (
        <div className="img-modal-overlay" onClick={(e) => { if (e.target.classList.contains('img-modal-overlay')) onClose(); }}>
            <button className="img-modal-close" onClick={onClose} title="Close (Esc)"><FaTimes /></button>
            
            <div className="img-modal-controls">
                <button onClick={handleZoomIn} title="Zoom In"><FaSearchPlus /></button>
                <button onClick={handleZoomOut} title="Zoom Out"><FaSearchMinus /></button>
                <button onClick={resetView} title="Reset Zoom"><FaUndo /></button>
            </div>

            {images.length > 1 && (
                <>
                    <button className="img-modal-nav prev" onClick={prevImage} disabled={currentIndex === 0} title="Previous (Left Arrow)"><FaChevronLeft /></button>
                    <button className="img-modal-nav next" onClick={nextImage} disabled={currentIndex === images.length - 1} title="Next (Right Arrow)"><FaChevronRight /></button>
                </>
            )}

            <div 
                className="img-modal-content"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <img 
                    src={images[currentIndex]} 
                    alt={`Preview ${currentIndex + 1}`}
                    style={{ 
                        transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                        cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                    draggable="false"
                />
            </div>
            
            {images.length > 1 && (
                <div className="img-modal-counter">
                    {currentIndex + 1} / {images.length}
                </div>
            )}
        </div>
    );
};

export default ImageModal;
