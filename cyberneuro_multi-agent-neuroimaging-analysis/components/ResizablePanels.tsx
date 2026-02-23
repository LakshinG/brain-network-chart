import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ResizablePanelsProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  defaultLeftWidth?: number; // percentage, default 50
  minLeftWidth?: number; // percentage, default 25
  maxLeftWidth?: number; // percentage, default 75
  onResize?: (leftWidth: number) => void;
  localStorageKey?: string; // Optional key to persist width
}

const ResizablePanels: React.FC<ResizablePanelsProps> = ({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 50,
  minLeftWidth = 25,
  maxLeftWidth = 75,
  onResize,
  localStorageKey = 'resizable-panels-width',
}) => {
  // Try to load saved width from localStorage
  const getSavedWidth = (): number => {
    if (localStorageKey) {
      try {
        const saved = localStorage.getItem(localStorageKey);
        if (saved) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed >= minLeftWidth && parsed <= maxLeftWidth) {
            return parsed;
          }
        }
      } catch (e) {
        // localStorage not available
      }
    }
    return defaultLeftWidth;
  };

  const [leftWidth, setLeftWidth] = useState<number>(getSavedWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // Save width to localStorage when it changes
  useEffect(() => {
    if (localStorageKey && !isDragging) {
      try {
        localStorage.setItem(localStorageKey, leftWidth.toString());
      } catch (e) {
        // localStorage not available
      }
    }
  }, [leftWidth, isDragging, localStorageKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = leftWidth;
    
    // Add cursor style to body during drag
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      
      // Calculate new width based on mouse position
      const deltaX = e.clientX - startXRef.current;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newWidth = startWidthRef.current + deltaPercent;
      
      // Clamp to min/max
      const clampedWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, newWidth));
      setLeftWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      if (onResize) {
        onResize(leftWidth);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, leftWidth, minLeftWidth, maxLeftWidth, onResize]);

  // Double-click to reset to default
  const handleDoubleClick = useCallback(() => {
    setLeftWidth(defaultLeftWidth);
    if (onResize) {
      onResize(defaultLeftWidth);
    }
  }, [defaultLeftWidth, onResize]);

  return (
    <div 
      ref={containerRef} 
      className="flex h-full w-full overflow-hidden"
    >
      {/* Left Panel */}
      <div 
        style={{ width: `${leftWidth}%` }} 
        className="h-full overflow-hidden flex-shrink-0"
      >
        {leftPanel}
      </div>
      
      {/* Draggable Divider */}
      <div
        className={`
          relative w-1 flex-shrink-0 cursor-col-resize group
          ${isDragging ? 'bg-indigo-500' : 'bg-slate-800 hover:bg-indigo-500/50'}
          transition-colors duration-150
        `}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Drag to resize • Double-click to reset"
      >
        {/* Visual handle indicator */}
        <div className={`
          absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-1 h-12 rounded-full
          ${isDragging ? 'bg-indigo-300' : 'bg-slate-600 group-hover:bg-indigo-400'}
          transition-colors duration-150
        `} />
        
        {/* Wider invisible hit area for easier grabbing */}
        <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
        
        {/* Width indicator during drag */}
        {isDragging && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-2 py-1 bg-indigo-600 text-white text-xs rounded shadow-lg whitespace-nowrap">
            {Math.round(leftWidth)}% / {Math.round(100 - leftWidth)}%
          </div>
        )}
      </div>
      
      {/* Right Panel */}
      <div 
        style={{ width: `${100 - leftWidth}%` }} 
        className="h-full overflow-hidden flex-shrink-0"
      >
        {rightPanel}
      </div>
      
      {/* Overlay during drag to prevent iframe interference */}
      {isDragging && (
        <div className="fixed inset-0 z-40 cursor-col-resize" />
      )}
    </div>
  );
};

export default ResizablePanels;