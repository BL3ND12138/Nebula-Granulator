
import React from 'react';
import { AudioOrb, LfoTarget } from '../services/types';
import OrbKnob from './OrbKnob';
import Waveform from './Waveform';

interface AdvancedViewProps {
  orbs: AudioOrb[];
  setOrbs: React.Dispatch<React.SetStateAction<AudioOrb[]>>;
  onBack: () => void;
}

const AdvancedView: React.FC<AdvancedViewProps> = ({ orbs, setOrbs, onBack }) => {

  const updateParam = (id: string, param: keyof AudioOrb['params'], value: any) => {
    setOrbs(prev => prev.map(o => {
        if (o.id === id) {
            return { ...o, params: { ...o.params, [param]: value } };
        }
        return o;
    }));
  };

  const lfoOptions: LfoTarget[] = ['none', 'position', 'grainSize', 'density', 'pitch', 'volume'];

  return (
    <div className="w-full h-full bg-slate-950 overflow-auto p-8 relative animate-fadeIn">
      <button 
        onClick={onBack}
        className="fixed top-6 left-6 text-white/60 hover:text-white flex items-center gap-2 z-50 bg-slate-900/80 px-4 py-2 rounded-full backdrop-blur"
      >
        ← BACK TO NEBULA
      </button>

      <div className="max-w-5xl mx-auto mt-12 flex flex-col gap-12 pb-20">
        <h1 className="text-2xl text-white font-light tracking-[0.2em] text-center border-b border-white/10 pb-4">
          ADVANCED CONTROLS
        </h1>

        {orbs.length === 0 && (
          <div className="text-center text-slate-500 py-12">
            No audio sources loaded. Return to main view to import.
          </div>
        )}

        {orbs.map(orb => (
          <div key={orb.id} className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 flex flex-col gap-6">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-white font-bold tracking-widest uppercase truncate max-w-md">
                    {orb.name}
                </span>
                <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: orb.visuals.colorHsl }} 
                />
            </div>

            <div className="w-full h-16">
                <Waveform orb={orb} height={64} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-y-8 gap-x-4 items-end">
                <OrbKnob 
                    label="Volume" 
                    value={orb.params.volume ?? 1.0} 
                    onChange={(v) => updateParam(orb.id, 'volume', v)}
                    color="#ffffff"
                />
                <OrbKnob 
                    label="Scan Pos" 
                    value={orb.params.position} 
                    onChange={(v) => updateParam(orb.id, 'position', v)}
                    color="#facc15"
                />
                 <OrbKnob 
                    label="Grain Size" 
                    value={orb.params.grainSize} 
                    min={0.01} 
                    max={orb.buffer?.duration || 1.0} // Allow full audio duration
                    onChange={(v) => updateParam(orb.id, 'grainSize', v)}
                    color="#38bdf8"
                />
                 <OrbKnob 
                    label="Density" 
                    value={orb.params.grainDensity} 
                    onChange={(v) => updateParam(orb.id, 'grainDensity', v)}
                    color="#f472b6"
                />
                 <OrbKnob 
                    label="Rnd Pitch" 
                    value={orb.params.randomPitch} 
                    max={1.0}
                    onChange={(v) => updateParam(orb.id, 'randomPitch', v)}
                    color="#a78bfa"
                />
                <div className="col-span-3 grid grid-cols-3 gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                   <div className="col-span-3 text-[10px] text-slate-400 uppercase tracking-wider text-center mb-[-10px]">LFO Modulation</div>
                   <OrbKnob 
                        label="Rate" 
                        value={orb.params.lfoRate} 
                        max={10.0}
                        onChange={(v) => updateParam(orb.id, 'lfoRate', v)}
                        color="#34d399"
                        size={50}
                    />
                    <OrbKnob 
                        label="Depth" 
                        value={orb.params.lfoDepth} 
                        onChange={(v) => updateParam(orb.id, 'lfoDepth', v)}
                        color="#fb923c"
                        size={50}
                    />
                    <div className="flex flex-col justify-center items-center gap-1 h-full">
                        <label className="text-[9px] uppercase tracking-wider text-slate-400">Target</label>
                        <select 
                            className="bg-black/40 text-xs text-white border border-slate-600 rounded px-2 py-1 outline-none focus:border-white w-full uppercase cursor-pointer"
                            value={orb.params.lfoTarget}
                            onChange={(e) => updateParam(orb.id, 'lfoTarget', e.target.value)}
                        >
                            {lfoOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdvancedView;
