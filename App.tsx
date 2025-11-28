

import React, { useState, useEffect, useRef } from 'react';
import NebulaCanvas from './components/NebulaCanvas';
import AdvancedView from './components/AdvancedView';
import { AudioOrb, Connection, GlobalParams, DEFAULT_GRANULAR_PARAMS } from './services/types';
import { engine } from './services/audioEngine';

function App() {
  const [view, setView] = useState<'NEBULA' | 'ADVANCED'>('NEBULA');
  const [orbs, setOrbs] = useState<AudioOrb[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  
  const [globalParams, setGlobalParams] = useState<GlobalParams>({
    chaos: 0.0,
    space: 0.3, 
    outputGain: 1.0,
    masterBpm: 120,
    beatSync: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state with Audio Engine
  useEffect(() => {
    engine.updateOrbs(orbs);
    engine.updateGlobalParams(globalParams);
    
    // Auto-resume audio context on user interaction (handled implicitly by first import, but good to be safe)
    if (orbs.length > 0) {
        engine.resume();
    }
  }, [orbs, globalParams]);


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        await engine.resume(); // Ensure context is running
        
        const files: File[] = Array.from(e.target.files);
        
        for (const file of files) {
            try {
                const buffer = await engine.decodeAudio(file);
                // Analyze BPM
                const bpm = await engine.detectBPM(buffer);
                
                const newOrb: AudioOrb = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    buffer: buffer,
                    params: { ...DEFAULT_GRANULAR_PARAMS },
                    visuals: {
                        x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
                        y: window.innerHeight / 2 + (Math.random() - 0.5) * 200,
                        radius: 50 + Math.random() * 20,
                        colorHsl: `hsl(${Math.random() * 360}, 70%, 60%)`
                    },
                    detectedBpm: bpm
                };
                
                setOrbs(prev => [...prev, newOrb]);
            } catch (err) {
                console.error("Error decoding audio file:", err);
            }
        }
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      await engine.resume();

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files: File[] = Array.from(e.dataTransfer.files);
        for (const file of files) {
            if (file.type.startsWith('audio/')) {
                 try {
                    const buffer = await engine.decodeAudio(file);
                    const bpm = await engine.detectBPM(buffer);

                    const newOrb: AudioOrb = {
                        id: Math.random().toString(36).substr(2, 9),
                        name: file.name,
                        buffer: buffer,
                        params: { ...DEFAULT_GRANULAR_PARAMS },
                        visuals: {
                            x: e.clientX,
                            y: e.clientY,
                            radius: 60,
                            colorHsl: `hsl(${Math.random() * 360}, 70%, 60%)`
                        },
                        detectedBpm: bpm
                    };
                    setOrbs(prev => [...prev, newOrb]);
                } catch (err) {
                    console.error(err);
                }
            }
        }
      }
  };

  return (
    <div 
        className="w-screen h-screen overflow-hidden bg-black text-white"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
    >
      <input 
        type="file" 
        multiple 
        accept="audio/*" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileUpload}
      />

      {view === 'NEBULA' ? (
        <NebulaCanvas 
            orbs={orbs}
            setOrbs={setOrbs}
            connections={connections}
            setConnections={setConnections}
            globalParams={globalParams}
            setGlobalParams={setGlobalParams}
            onImportClick={() => fileInputRef.current?.click()}
            onSettingsClick={() => setView('ADVANCED')}
            showHint={orbs.length === 0}
        />
      ) : (
        <AdvancedView 
            orbs={orbs}
            setOrbs={setOrbs}
            onBack={() => setView('NEBULA')}
        />
      )}
    </div>
  );
}

export default App;