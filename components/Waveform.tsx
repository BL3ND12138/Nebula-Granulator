import React, { useRef, useEffect } from 'react';
import { AudioOrb } from '../services/types';

interface WaveformProps {
  orb: AudioOrb;
  height?: number;
}

const Waveform: React.FC<WaveformProps> = ({ orb, height = 64 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !orb.buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, height);

    const data = orb.buffer.getChannelData(0);
    const step = Math.ceil(data.length / rect.width);
    const amp = height / 2;

    ctx.beginPath();
    ctx.strokeStyle = orb.visuals.colorHsl.replace('hsl', 'hsla').replace(')', ', 0.6)');
    ctx.lineWidth = 1;

    for (let i = 0; i < rect.width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.moveTo(i, amp + min * amp);
      ctx.lineTo(i, amp + max * amp);
    }
    ctx.stroke();

    // Draw Playhead / Scan position
    const posX = orb.params.position * rect.width;
    ctx.beginPath();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.moveTo(posX, 0);
    ctx.lineTo(posX, height);
    ctx.stroke();

    // Draw Grain Width indicator
    const grainW = (orb.params.grainSize / orb.buffer.duration) * rect.width;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(posX, 0, grainW, height);

  }, [orb, height]);

  return (
    <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height }}
        className="rounded bg-slate-900/50 border border-slate-700"
    />
  );
};

export default Waveform;