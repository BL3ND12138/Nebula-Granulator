

import { AudioOrb, GlobalParams } from './types';

export class AudioEngine {
  private ctx: AudioContext;
  
  // Mix Buses
  private masterGain: GainNode;
  private dryGain: GainNode; // Now used as main grain bus
  private delaySend: GainNode;
  
  // FX Nodes (Space/Delay)
  private delayNode: DelayNode;
  private feedbackGain: GainNode;
  private delayFilter: BiquadFilterNode;
  
  private compressor: DynamicsCompressorNode;
  
  private orbs: Map<string, AudioOrb> = new Map();
  private isPlaying: boolean = false;
  private schedulerInterval: number | null = null;
  private globalParams: GlobalParams = {
    chaos: 0.0,
    space: 0.3,
    outputGain: 1.0,
    masterBpm: 120,
    beatSync: false,
  };

  // Glitch State
  private glitchState = {
      active: false,
      endTime: 0,
      mode: 'NONE' as 'NONE' | 'STUTTER' | 'REVERSE' | 'PITCH_JUMP',
      frozenOffset: -1
  };

  // Cached Hanning Window Curve for smooth envelopes
  private hanningCurve: Float32Array;

  // Lookahead scheduler
  private lookahead = 25.0; // ms
  private scheduleAheadTime = 0.1; // seconds

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create Nodes
    this.masterGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.dryGain = this.ctx.createGain();
    
    // Space/Delay Chain Setup
    this.delaySend = this.ctx.createGain();
    this.delayNode = this.ctx.createDelay(5.0); // Max delay 5s
    this.feedbackGain = this.ctx.createGain();
    this.delayFilter = this.ctx.createBiquadFilter();

    // 1. Master Output Chain
    // MasterGain -> Compressor -> Speakers
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
    
    // 2. Grain Bus (DryGain is a misnomer now, it's the main signal path)
    this.dryGain.connect(this.masterGain);

    // 3. Delay Network (Dub Delay Topology)
    // Send -> Delay
    this.delaySend.connect(this.delayNode);
    // Delay -> Master (Wet Signal)
    this.delayNode.connect(this.masterGain);
    // Feedback Loop: Delay -> Filter -> FeedbackGain -> Delay
    this.delayNode.connect(this.delayFilter);
    this.delayFilter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);

    // Initial FX Settings
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 1200; // Dark dubby echoes
    this.delayFilter.Q.value = 0.5;
    
    // Limiter Config
    this.compressor.threshold.value = -3;
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 20; 
    this.compressor.attack.value = 0.001; 
    this.compressor.release.value = 0.1;
    
    this.masterGain.gain.value = 1.0;
    this.dryGain.gain.value = 1.0;

    // Pre-calculate Hanning window
    this.hanningCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
        this.hanningCurve[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / 1023));
    }
  }

  public async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.startScheduler();
    }
  }

  public async decodeAudio(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  public async detectBPM(buffer: AudioBuffer): Promise<number> {
    try {
        const offlineCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        
        const filter = offlineCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 150;
        
        source.connect(filter);
        filter.connect(offlineCtx.destination);
        source.start(0);
        
        const renderedBuffer = await offlineCtx.startRendering();
        const data = renderedBuffer.getChannelData(0);
        
        const peaks = [];
        const threshold = 0.3; 
        const minDistance = 0.25 * buffer.sampleRate; 

        for (let i = 0; i < data.length; i++) {
            if (data[i] > threshold) {
                if (peaks.length === 0 || i - peaks[peaks.length-1] > minDistance) {
                    peaks.push(i);
                }
            }
        }
        
        if (peaks.length < 2) return 120; 

        const intervals = [];
        for (let i = 1; i < peaks.length; i++) {
            const interval = peaks[i] - peaks[i-1];
            intervals.push(interval);
        }

        const histogram: {[key: number]: number} = {};
        intervals.forEach(interval => {
             const rounded = Math.round(interval / 1000) * 1000; 
             histogram[rounded] = (histogram[rounded] || 0) + 1;
        });

        let bestInterval = intervals[0];
        let maxCount = 0;
        for (const key in histogram) {
            if (histogram[key] > maxCount) {
                maxCount = histogram[key];
                bestInterval = parseInt(key);
            }
        }
        
        if (!bestInterval) return 120;

        const bpm = 60 / (bestInterval / buffer.sampleRate);
        
        let finalBpm = bpm;
        while (finalBpm < 70) finalBpm *= 2;
        while (finalBpm > 180) finalBpm /= 2;

        return Math.round(finalBpm) || 120;
    } catch (e) {
        console.warn("BPM Detection failed", e);
        return 120;
    }
  }

  public updateGlobalParams(params: GlobalParams) {
    this.globalParams = params;
    const now = this.ctx.currentTime;
    
    this.masterGain.gain.setTargetAtTime(params.outputGain, now, 0.1);

    // UPDATE SPACE (DELAY) PARAMS
    let delayTime = 0.5; 
    if (params.beatSync) {
        const beatDur = 60 / params.masterBpm;
        delayTime = beatDur * 0.75; // Dotted 8th
    }
    this.delayNode.delayTime.setTargetAtTime(delayTime, now, 0.2);

    this.delaySend.gain.setTargetAtTime(params.space, now, 0.1);
    
    const fb = Math.min(0.7, params.space * 0.8); 
    this.feedbackGain.gain.setTargetAtTime(fb, now, 0.1);
  }

  public updateOrbs(orbsList: AudioOrb[]) {
    this.orbs.clear();
    orbsList.forEach(orb => {
      this.orbs.set(orb.id, orb);
    });
  }

  private startScheduler() {
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    this.schedulerInterval = window.setInterval(() => {
      this.scheduler();
    }, this.lookahead);
  }

  private nextGrainTime: Map<string, number> = new Map();

  private scheduler() {
    const currentTime = this.ctx.currentTime;

    // --- CHAOS / GLITCH STATE MANAGEMENT ---
    // If Chaos > 0, we randomly trigger glitch states
    if (this.globalParams.chaos > 0.05) {
        if (!this.glitchState.active && Math.random() < (this.globalParams.chaos * 0.05)) {
            // Start Glitch
            this.glitchState.active = true;
            const duration = 0.1 + Math.random() * 0.2; // Short bursts
            this.glitchState.endTime = currentTime + duration;
            
            const r = Math.random();
            if (r < 0.33) this.glitchState.mode = 'STUTTER';
            else if (r < 0.66) this.glitchState.mode = 'REVERSE';
            else this.glitchState.mode = 'PITCH_JUMP';
            
            this.glitchState.frozenOffset = -1; // Reset
        }
    }
    
    if (this.glitchState.active && currentTime > this.glitchState.endTime) {
        this.glitchState.active = false;
        this.glitchState.mode = 'NONE';
        this.glitchState.frozenOffset = -1;
    }


    this.orbs.forEach((orb, id) => {
      let nextTime = this.nextGrainTime.get(id) || currentTime;

      if (nextTime < currentTime) {
        nextTime = currentTime;
      }

      while (nextTime < currentTime + this.scheduleAheadTime) {
        // --- LFO LOGIC ---
        let lfoFreq = orb.params.lfoRate;
        
        // BEAT SYNC LFO
        if (this.globalParams.beatSync) {
            const bpm = this.globalParams.masterBpm || 120;
            const quarterNoteHz = bpm / 60; 
            const ratios = [0.125, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0];
            
            let closestFreq = lfoFreq;
            let minDist = Infinity;
            
            for(const r of ratios) {
                const targetFreq = quarterNoteHz * r;
                const dist = Math.abs(targetFreq - lfoFreq);
                if (dist < minDist) {
                    minDist = dist;
                    closestFreq = targetFreq;
                }
            }
            lfoFreq = closestFreq;
        }

        const lfoVal = Math.sin(nextTime * lfoFreq * 2 * Math.PI) * orb.params.lfoDepth;
        
        let effectiveDensity = orb.params.grainDensity;
        if (orb.params.lfoTarget === 'density') {
            effectiveDensity += lfoVal; 
        }
        
        // GLITCH OVERRIDE: STUTTER (Beat Repeat)
        if (this.glitchState.active && this.glitchState.mode === 'STUTTER') {
            effectiveDensity = 1.0; // Max density
        }

        this.scheduleGrain(orb, nextTime, lfoVal);
        
        // --- NEXT TIME CALCULATION ---
        if (this.glitchState.active && this.glitchState.mode === 'STUTTER') {
             // STUTTER TIMING: Very fast repeats
             nextTime += 0.05; // 50ms intervals
        } else if (this.globalParams.beatSync) {
            const bpm = this.globalParams.masterBpm || 120;
            const beatDur = 60 / bpm;
            
            let subdivision = 0.25; 
            
            const d = Math.max(0, Math.min(1, effectiveDensity));
            if (d < 0.25) subdivision = 1.0; 
            else if (d < 0.5) subdivision = 0.5; 
            else if (d < 0.75) subdivision = 0.25; 
            else subdivision = 0.125; 

            let interval = beatDur * subdivision;
            const humanJitter = (Math.random() - 0.5) * interval * 0.05;
            nextTime += (interval + humanJitter);

        } else {
            const density = Math.max(0.01, Math.min(1.0, effectiveDensity));
            const minInterval = 0.01;
            const maxInterval = 0.5;
            const interval = maxInterval - (Math.sqrt(density) * (maxInterval - minInterval));
            
            const jitter = (Math.random() - 0.5) * 0.01;
            nextTime += Math.max(0.005, interval + jitter);
        }
      }
      
      this.nextGrainTime.set(id, nextTime);
    });
  }

  private scheduleGrain(orb: AudioOrb, time: number, lfoVal: number) {
    if (!orb.buffer) return;

    let position = orb.params.position;
    let grainSize = orb.params.grainSize;
    let volume = (orb.params.volume !== undefined) ? orb.params.volume : 1.0;
    let playbackRate = 1.0;

    // LFO Modulation
    switch (orb.params.lfoTarget) {
        case 'position': position += lfoVal * 0.5; break;
        case 'grainSize': grainSize += lfoVal * 0.2; break;
        case 'volume': volume += lfoVal; break;
        case 'pitch': playbackRate += lfoVal; break;
    }

    // BEAT SYNC: Base Pitch
    if (this.globalParams.beatSync && orb.detectedBpm) {
        let ratio = this.globalParams.masterBpm / orb.detectedBpm;
        while (ratio > 1.5) ratio /= 2;
        while (ratio < 0.75) ratio *= 2;
        playbackRate *= ratio;
    }

    // --- GLITCH / CHAOS MODIFICATIONS ---
    if (this.glitchState.active) {
        if (this.glitchState.mode === 'REVERSE') {
            playbackRate *= -1;
        } else if (this.glitchState.mode === 'PITCH_JUMP') {
             // Random octave jump up or down
             const jump = Math.random() > 0.5 ? 2.0 : 0.5;
             playbackRate *= jump;
        } else if (this.glitchState.mode === 'STUTTER') {
             grainSize = 0.05; // Short grains for stutter
        }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = orb.buffer;

    const envelope = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    
    source.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.dryGain);
    panner.connect(this.delaySend);

    const duration = orb.buffer.duration;
    
    // Scan Position
    let offset = position * duration;

    // CHAOS: FREEZE POSITION (BEAT REPEAT)
    if (this.glitchState.active && this.glitchState.mode === 'STUTTER') {
        if (this.glitchState.frozenOffset < 0) {
            this.glitchState.frozenOffset = offset;
        } else {
            offset = this.glitchState.frozenOffset;
        }
    } else {
        // Normal Jitter
        const posJitter = (Math.random() - 0.5) * 0.05; 
        offset += posJitter;
    }
    
    offset = offset % duration;
    if (offset < 0) offset += duration;

    grainSize = Math.max(0.01, grainSize); 
    
    // Space (Stereo Width)
    const space = this.globalParams.space;
    const panAmount = (Math.random() - 0.5) * 2 * space; 
    panner.pan.setValueAtTime(panAmount, time);

    // Random Pitch (Standard Granular)
    const randomCents = (Math.random() - 0.5) * orb.params.randomPitch * 2400; 
    const randomRateMult = Math.pow(2, randomCents / 1200);
    playbackRate *= randomRateMult;
    
    // Clamp limits
    // Note: Allow negative rate for reverse
    if (Math.abs(playbackRate) < 0.05) playbackRate = 0.05 * Math.sign(playbackRate);
    if (Math.abs(playbackRate) > 4.0) playbackRate = 4.0 * Math.sign(playbackRate);
    
    source.playbackRate.value = playbackRate;

    // Enveloping
    const peakGain = Math.max(0, volume);
    
    envelope.gain.setValueAtTime(0, time);
    const scaledCurve = new Float32Array(this.hanningCurve.length);
    for(let i=0; i<this.hanningCurve.length; i++) {
        scaledCurve[i] = this.hanningCurve[i] * peakGain;
    }
    
    try {
        envelope.gain.setValueCurveAtTime(scaledCurve, time, grainSize);
    } catch (e) {
        envelope.gain.linearRampToValueAtTime(peakGain, time + grainSize/2);
        envelope.gain.linearRampToValueAtTime(0, time + grainSize);
    }

    source.start(time, offset);
    source.stop(time + grainSize + 0.05); 
  }
}

export const engine = new AudioEngine();
