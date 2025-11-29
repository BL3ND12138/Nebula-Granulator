
import React, { useRef, useEffect, useState } from 'react';
import { AudioOrb, Connection, GlobalParams } from '../services/types';
import { engine } from '../services/audioEngine';
import OrbKnob from './OrbKnob';

interface NebulaCanvasProps {
  orbs: AudioOrb[];
  setOrbs: React.Dispatch<React.SetStateAction<AudioOrb[]>>;
  connections: Connection[];
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  globalParams: GlobalParams;
  setGlobalParams: (p: GlobalParams) => void;
  onImportClick: () => void;
  onSettingsClick: () => void;
  showHint: boolean;
}

// Helper: Distance from point (p) to line segment (v - w)
function distToSegment(p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}) {
  const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
  if (l2 === 0) return Math.sqrt((p.x - v.x) * (p.x - v.x) + (p.y - v.y) * (p.y - v.y));
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return Math.sqrt((p.x - proj.x) * (p.x - proj.x) + (p.y - proj.y) * (p.y - proj.y));
}

// Meteor / Particle Type
interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  opacity: number;
  size: number;
  type: 'STAR' | 'METEOR';
}

const NebulaCanvas: React.FC<NebulaCanvasProps> = ({
  orbs,
  setOrbs,
  connections,
  setConnections,
  globalParams,
  setGlobalParams,
  onImportClick,
  onSettingsClick,
  showHint
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const timeRef = useRef<number>(0);
  const meteorsRef = useRef<Meteor[]>([]);
  
  // Interaction State
  const [hoveredOrbId, setHoveredOrbId] = useState<string | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ type: 'ORB' | 'CONNECT', id: string, startX: number, startY: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showGlobalControls, setShowGlobalControls] = useState(false);

  // Local state for BPM input to allow free typing
  const [bpmInputValue, setBpmInputValue] = useState(globalParams.masterBpm.toString());

  // Sync local BPM input if global param changes externally
  useEffect(() => {
    setBpmInputValue(globalParams.masterBpm.toString());
  }, [globalParams.masterBpm]);

  // Typewriter
  const [hintText, setHintText] = useState("");
  const fullHint = "import an audio to start";

  useEffect(() => {
    if (!showHint) return;
    let i = 0;
    const interval = setInterval(() => {
        setHintText(fullHint.slice(0, i + 1));
        i++;
        if (i > fullHint.length) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [showHint]);

  // Reset/Create Meteor or Star
  const resetMeteor = (w: number, h: number, initial = false): Meteor => {
    // 85% Stars (Background), 15% Meteors (Foreground)
    const isStar = Math.random() > 0.15;
    
    // Angle: flowing top-right to bottom-left (approx 135 degrees)
    const angle = Math.PI * 0.75 + (Math.random() - 0.5) * 0.1; 
    
    // Speed: Stars are very slow, Meteors are slightly faster (but still slow/graceful)
    const speed = isStar 
        ? 0.05 + Math.random() * 0.1 
        : 0.3 + Math.random() * 0.4;
    
    let x, y;
    if (initial) {
        x = Math.random() * w;
        y = Math.random() * h;
    } else {
        // Spawn from top or right edge
        if (Math.random() > 0.5) {
            x = Math.random() * w + 100; // Right side bias
            y = -50;
        } else {
            x = w + 50;
            y = Math.random() * h;
        }
    }

    return {
        x, 
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: isStar ? 1.5 : 20 + Math.random() * 80, // Stars are dots, Meteors have trails
        opacity: isStar 
            ? 0.1 + Math.random() * 0.4 // Twinkling stars
            : 0.2 + Math.random() * 0.5, // Meteors
        size: isStar 
            ? 0.5 + Math.random() * 1.0 
            : 0.5 + Math.random() * 1.5,
        type: isStar ? 'STAR' : 'METEOR'
    };
  };

  // Main Render Loop
  const render = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    timeRef.current = time * 0.001; // seconds
    const t = timeRef.current;

    // 1. Background / Nebula
    ctx.fillStyle = '#050508'; // Very dark blue-black
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Simple "Nebula" using radial gradients and additive blending
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
        const x = canvas.width/2 + Math.sin(t * 0.1 + i) * 300;
        const y = canvas.height/2 + Math.cos(t * 0.15 + i * 2) * 200;
        const r = 400 + Math.sin(t * 0.2 + i) * 100;
        
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `hsla(${260 + i * 30}, 50%, 10%, 0.3)`); // Purple/Blue Deep
        grad.addColorStop(1, 'transparent');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- METEOR / STAR PARTICLES ---
    // Initialize dense particle field
    if (meteorsRef.current.length === 0) {
        // High count for "Galaxy" feel
        for(let i=0; i<350; i++) {
            meteorsRef.current.push(resetMeteor(canvas.width, canvas.height, true));
        }
    }

    // Draw Particles
    meteorsRef.current.forEach((m, i) => {
        m.x += m.vx;
        m.y += m.vy;

        // Wrap around logic (graceful flow)
        if (m.x < -100 || m.y > canvas.height + 100) {
            meteorsRef.current[i] = resetMeteor(canvas.width, canvas.height);
        }

        if (m.type === 'STAR') {
            // Draw Star (Simple dot)
            ctx.fillStyle = `rgba(200, 220, 255, ${m.opacity})`;
            ctx.fillRect(m.x, m.y, m.size, m.size);
        } else {
            // Draw Meteor (Trail)
            const tailX = m.x - m.vx * m.length;
            const tailY = m.y - m.vy * m.length;

            const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
            grad.addColorStop(0, `rgba(255, 255, 255, ${m.opacity})`);
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.strokeStyle = grad;
            ctx.lineWidth = m.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(tailX, tailY);
            ctx.stroke();
        }
    });

    ctx.globalCompositeOperation = 'source-over';

    // 2. Connections
    ctx.lineCap = 'round';
    connections.forEach(conn => {
        const from = orbs.find(o => o.id === conn.fromOrbId);
        const to = orbs.find(o => o.id === conn.toOrbId);
        if (from && to) {
            const dx = to.visuals.x - from.visuals.x;
            const dy = to.visuals.y - from.visuals.y;
            
            ctx.save();
            
            // Highlight if hovered for deletion
            if (conn.id === hoveredConnectionId) {
                ctx.strokeStyle = '#ef4444'; // Red for delete
                ctx.lineWidth = 5;
                ctx.setLineDash([]);
                ctx.shadowColor = '#ef4444';
                ctx.shadowBlur = 15;
            } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 15]);
                ctx.lineDashOffset = -t * 50; // Animate flow
                ctx.shadowBlur = 0;
            }
            
            ctx.beginPath();
            ctx.moveTo(from.visuals.x, from.visuals.y);
            // Curve the line slightly
            const cx = (from.visuals.x + to.visuals.x) / 2 - dy * 0.2;
            const cy = (from.visuals.y + to.visuals.y) / 2 + dx * 0.2;
            ctx.quadraticCurveTo(cx, cy, to.visuals.x, to.visuals.y);
            ctx.stroke();
            ctx.restore();
        }
    });

    // Drawing Active Connection Line
    if (dragState?.type === 'CONNECT') {
        const from = orbs.find(o => o.id === dragState.id);
        if (from) {
             ctx.save();
             ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
             ctx.lineWidth = 1;
             ctx.setLineDash([2, 5]);
             ctx.beginPath();
             ctx.moveTo(from.visuals.x, from.visuals.y);
             ctx.lineTo(mousePos.x, mousePos.y);
             ctx.stroke();
             ctx.restore();
        }
    }

    // 3. Orbs
    orbs.forEach(orb => {
        const { x, y, radius, colorHsl } = orb.visuals;
        
        // Glow
        const grad = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 2);
        grad.addColorStop(0, colorHsl);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Core "Fibrous" Look
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip(); // Clip to sphere

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        
        // Draw random noisy lines inside
        const seed = parseInt(orb.id.slice(-4), 16) || 1;
        
        for (let j = 0; j < 5; j++) {
            ctx.beginPath();
            const phase = t * (0.5 + (j * 0.1)) + j;
            const noiseX = Math.sin(phase) * (radius * 0.4);
            const noiseY = Math.cos(phase * 1.3) * (radius * 0.4);
            
            ctx.ellipse(x + noiseX, y + noiseY, radius * 0.8, radius * 0.3, phase, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    });

    requestRef.current = requestAnimationFrame(render);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(render);
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [orbs, connections, dragState, mousePos, hoveredOrbId, hoveredConnectionId]);

  // --- HIT DETECTION LOGIC ---
  const getConnectionAt = (mx: number, my: number) => {
    const threshold = 40; // Generous 40px tolerance
    let closestConn: Connection | null = null;
    let minDistance = threshold;

    connections.forEach(c => {
        const from = orbs.find(o => o.id === c.fromOrbId);
        const to = orbs.find(o => o.id === c.toOrbId);
        if (!from || !to) return;
        
        const dx = to.visuals.x - from.visuals.x;
        const dy = to.visuals.y - from.visuals.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Control Point logic matches render
        const cx = (from.visuals.x + to.visuals.x) / 2 - dy * 0.2;
        const cy = (from.visuals.y + to.visuals.y) / 2 + dx * 0.2;

        // Dynamic sampling based on length (1 sample every 10 pixels)
        // Min 20, Max 200 samples
        const segments = Math.min(200, Math.max(20, Math.floor(dist / 10)));
        
        let p1 = { x: from.visuals.x, y: from.visuals.y };
        
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const it = 1 - t;
            // Quadratic Bezier Formula: (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
            const px = (it * it * from.visuals.x) + (2 * it * t * cx) + (t * t * to.visuals.x);
            const py = (it * it * from.visuals.y) + (2 * it * t * cy) + (t * t * to.visuals.y);
            const p2 = { x: px, y: py };

            // Check distance to segment p1-p2
            const d = distToSegment({x: mx, y: my}, p1, p2);
            if (d < minDistance) {
                minDistance = d;
                closestConn = c;
            }
            p1 = p2;
        }
    });

    return closestConn;
  };

  // Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Support Mac Command key (metaKey)
    const isCtrl = e.ctrlKey || e.metaKey;

    // 1. Check Orb Interactions
    for (let i = orbs.length - 1; i >= 0; i--) {
        const orb = orbs[i];
        const dx = x - orb.visuals.x;
        const dy = y - orb.visuals.y;
        if (Math.sqrt(dx*dx + dy*dy) < orb.visuals.radius) {
            
            if (isCtrl) {
                // Delete Orb (and its connections)
                setOrbs(prev => prev.filter(o => o.id !== orb.id));
                setConnections(prev => prev.filter(c => c.fromOrbId !== orb.id && c.toOrbId !== orb.id));
                return;
            }

            if (e.shiftKey) {
                // Start Connection
                setDragState({ type: 'CONNECT', id: orb.id, startX: x, startY: y });
            } else {
                // Move Orb
                setDragState({ type: 'ORB', id: orb.id, startX: x, startY: y });
            }
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
        }
    }
    
    // 2. Check Connection Deletion (Ctrl/Cmd + Shift + Click on line)
    if (isCtrl && e.shiftKey) {
        const hitConn = getConnectionAt(x, y);
        if (hitConn) {
            setConnections(prev => prev.filter(c => c.id !== hitConn.id));
            setHoveredConnectionId(null);
            e.preventDefault();
        }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    // Handle Global Controls Visibility (Right Edge)
    if (x > rect.width * 0.85) {
        setShowGlobalControls(true);
    } else {
        setShowGlobalControls(false);
    }

    if (dragState) {
        if (dragState.type === 'ORB') {
            setOrbs(prev => prev.map(o => {
                if (o.id === dragState.id) {
                    return { ...o, visuals: { ...o.visuals, x, y }};
                }
                return o;
            }));
        }
    } else {
        // Hover Detection
        let hit = null;
        for (let i = orbs.length - 1; i >= 0; i--) {
            const orb = orbs[i];
            const dx = x - orb.visuals.x;
            const dy = y - orb.visuals.y;
            if (Math.sqrt(dx*dx + dy*dy) < orb.visuals.radius) {
                hit = orb.id;
                break;
            }
        }
        setHoveredOrbId(hit);

        // Hover Connection Feedback
        // Only valid if Ctrl/Cmd + Shift is held
        const isCtrl = e.ctrlKey || e.metaKey;
        if (isCtrl && e.shiftKey) {
            const hitConn = getConnectionAt(x, y);
            setHoveredConnectionId(hitConn ? hitConn.id : null);
        } else {
            setHoveredConnectionId(null);
        }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragState?.type === 'CONNECT') {
        // Find drop target
        for (let i = orbs.length - 1; i >= 0; i--) {
            const orb = orbs[i];
            const dx = x - orb.visuals.x;
            const dy = y - orb.visuals.y;
            if (Math.sqrt(dx*dx + dy*dy) < orb.visuals.radius) {
                if (orb.id !== dragState.id) {
                    // Create Connection
                    const exists = connections.some(c => 
                        (c.fromOrbId === dragState.id && c.toOrbId === orb.id) ||
                        (c.fromOrbId === orb.id && c.toOrbId === dragState.id)
                    );
                    if (!exists) {
                        setConnections(prev => [...prev, {
                            id: Math.random().toString(36).substr(2,9),
                            fromOrbId: dragState.id,
                            toOrbId: orb.id
                        }]);
                    }
                }
                break;
            }
        }
    }

    setDragState(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (hoveredOrbId) {
        setOrbs(prev => prev.map(o => {
            if (o.id === hoveredOrbId) {
                const newR = Math.max(20, Math.min(150, o.visuals.radius - e.deltaY * 0.1));
                return { ...o, visuals: { ...o.visuals, radius: newR }};
            }
            return o;
        }));
    }
  };

  const resizeCanvas = () => {
      if(canvasRef.current) {
          canvasRef.current.width = window.innerWidth;
          canvasRef.current.height = window.innerHeight;
      }
  };

  useEffect(() => {
      window.addEventListener('resize', resizeCanvas);
      resizeCanvas();
      return () => window.removeEventListener('resize', resizeCanvas);
  }, []);


  const commitBpm = () => {
    let val = Math.round(Number(bpmInputValue));
    
    // If input is invalid, revert to previous value
    if (isNaN(val)) {
        setBpmInputValue(globalParams.masterBpm.toString());
        return;
    }
    
    if (val < 10) val = 10;
    if (val > 999) val = 999;
    
    setGlobalParams({...globalParams, masterBpm: val});
    // Update local state to matched clamped value
    setBpmInputValue(val.toString());
  };


  return (
    <div className="relative w-full h-full" onContextMenu={(e) => e.preventDefault()}>
        <canvas
            ref={canvasRef}
            className={`w-full h-full touch-none ${hoveredConnectionId ? 'cursor-pointer' : 'cursor-crosshair'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
        />

        {/* Top Right UI Container: Beat Sync & Settings */}
        <div className="absolute top-4 right-4 flex items-start gap-4 z-20 pointer-events-auto">
            
            {/* Beat Sync Controls */}
            <div className="flex flex-col items-center gap-2 bg-black/40 backdrop-blur rounded p-2 border border-white/10">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setGlobalParams({...globalParams, beatSync: !globalParams.beatSync})}
                        className={`text-[10px] uppercase font-bold px-2 py-1 rounded transition-colors ${globalParams.beatSync ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white/50'}`}
                    >
                        Beat Sync
                    </button>
                    <div className="flex flex-col items-center ml-2">
                         <input
                            type="text"
                            inputMode="numeric"
                            value={bpmInputValue}
                            onChange={(e) => setBpmInputValue(e.target.value)}
                            onBlur={commitBpm}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    commitBpm();
                                    (e.currentTarget as HTMLInputElement).blur();
                                }
                            }}
                            className={`w-14 bg-transparent text-center font-mono text-lg font-bold outline-none border-b border-white/10 focus:border-cyan-500 transition-colors ${globalParams.beatSync ? 'text-cyan-400' : 'text-slate-500'}`}
                        />
                        <span className="text-[9px] text-slate-500 uppercase mt-1">BPM</span>
                    </div>
                </div>
            </div>

            {/* Settings Button */}
            <button 
                onClick={onSettingsClick}
                className="text-white/50 hover:text-white transition-colors p-2"
                title="Advanced Settings"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.29 1.52 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </button>
        </div>

        {/* Global Controls Panel (Right Edge) */}
        <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-24 p-2 flex flex-col gap-6 items-center transition-opacity duration-500 ${showGlobalControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <OrbKnob 
                label="Chaos" 
                value={globalParams.chaos} 
                onChange={(v) => setGlobalParams({...globalParams, chaos: v})} 
                color="#ef4444" 
            />
            <OrbKnob 
                label="Space" 
                value={globalParams.space} 
                onChange={(v) => setGlobalParams({...globalParams, space: v})} 
                color="#fcd34d"
            />
            <OrbKnob 
                label="Out Gain" 
                value={globalParams.outputGain} 
                max={2.0}
                onChange={(v) => setGlobalParams({...globalParams, outputGain: v})} 
                color="#34d399"
            />
        </div>

        {/* Hint Text */}
        {orbs.length === 0 && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/70 font-mono text-sm pointer-events-none">
                {hintText}<span className="animate-pulse">_</span>
            </div>
        )}

        {/* Import Overlay (Button) */}
        <div className="absolute bottom-4 right-4 pointer-events-auto">
            <button 
                onClick={onImportClick}
                className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1 rounded border border-white/20 backdrop-blur-sm transition-all"
            >
                + IMPORT AUDIO
            </button>
        </div>
    </div>
  );
};

export default NebulaCanvas;
