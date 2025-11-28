import React, { useRef, useState } from 'react';

interface OrbKnobProps {
  value: number; // 0 to 1 usually
  min?: number;
  max?: number;
  label: string;
  onChange: (val: number) => void;
  size?: number;
  color?: string;
  horizontalDrag?: boolean; // Deprecated but kept for compatibility interface
}

const OrbKnob: React.FC<OrbKnobProps> = ({
  value,
  min = 0,
  max = 1,
  label,
  onChange,
  size = 60,
  color = '#a855f7', // default purple-500
}) => {
  const [isDragging, setIsDragging] = useState(false);
  // Track X and Y for robust dragging
  const startPosRef = useRef<{ x: number; y: number; val: number }>({ x: 0, y: 0, val: 0 });

  // Map value to 0-1 range for drawing
  const normalizedValue = (value - min) / (max - min);

  // Drawing constants
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  
  // Arc Calculation: Left (9 o'clock) is start, Right (3 o'clock) is end
  const startAngle = Math.PI; // 180 degrees
  const totalAngle = Math.PI; // 180 degrees sweep
  const currentAngle = startAngle - (normalizedValue * totalAngle);

  // Helper to get XY from angle
  const getXY = (angle: number) => {
    // In SVG, 0 is 3 o'clock. We move counter-clockwise for negative angles
    return {
      x: cx + radius * Math.cos(angle),
      y: cy - radius * Math.sin(angle), // y is inverted in SVG
    };
  };

  const startPt = getXY(startAngle);
  const endPt = getXY(currentAngle);

  // Path string
  const largeArcFlag = 0; // Since we only do max 180 deg
  const pathData = [
    `M ${startPt.x} ${startPt.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endPt.x} ${endPt.y}`,
  ].join(' ');

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    // We capture Y now for vertical dragging
    startPosRef.current = { x: e.clientX, y: e.clientY, val: value };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    // SWITCHED TO VERTICAL DRAG
    // Vertical drag is standard for audio knobs and solves the "Right Edge" screen issue.
    // Drag UP to Increase, Drag DOWN to Decrease.
    // We subtract clientY because screen Y increases downwards, but we want Up to be positive.
    const deltaY = startPosRef.current.y - e.clientY; 
    
    const sensitivity = 0.01; // Increased sensitivity (was 0.005)
    const range = max - min;
    
    let newValue = startPosRef.current.val + (deltaY * sensitivity * range);
    newValue = Math.max(min, Math.min(max, newValue));
    
    onChange(newValue);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-1 select-none group">
      <div 
        className="relative cursor-ns-resize touch-none transition-transform hover:scale-110 active:scale-95"
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Drag Up/Down to change value"
      >
        {/* Background Circle (dim) */}
        <svg width={size} height={size} className="overflow-visible">
            {/* Background Arc */}
            <path
                d={`M ${getXY(Math.PI).x} ${getXY(Math.PI).y} A ${radius} ${radius} 0 0 1 ${getXY(0).x} ${getXY(0).y}`}
                fill="none"
                stroke="#334155"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
            />
            
            {/* Active Value Arc */}
            <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth + 2}
                strokeLinecap="round"
                filter="url(#glow)"
            />

            {/* Definitions for Glow */}
            <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
        </svg>

        {/* Center Dot or Label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-1 h-1 rounded-full bg-white/50" />
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-slate-400 group-hover:text-white transition-colors">
        {label}
      </span>
    </div>
  );
};

export default OrbKnob;