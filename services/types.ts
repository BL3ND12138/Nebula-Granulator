

export interface GlobalParams {
  chaos: number; // 0 to 1 (Replaces dryWet: Controls Stutter, Glitch, and Beat Repeat probability)
  space: number; // 0 to 1 (Replaces shimmer: Controls Delay Level, Feedback, and Stereo Width)
  outputGain: number; // 0 to 2 (linear)
  masterBpm: number;
  beatSync: boolean;
}

export type LfoTarget = 'none' | 'position' | 'grainSize' | 'density' | 'pitch' | 'volume';

export interface GranularParams {
  grainSize: number; // seconds
  grainDensity: number; // grains per second (approx) or overlap factor
  position: number; // 0 to 1 (scan position)
  randomPitch: number; // 0 to 1200 cents range
  lfoRate: number; // Hz
  lfoDepth: number; // 0 to 1
  volume: number; // 0 to 1 (Linear gain)
  lfoTarget: LfoTarget;
}

export interface OrbVisuals {
  x: number;
  y: number;
  radius: number;
  colorHsl: string;
}

export interface AudioOrb {
  id: string;
  name: string;
  buffer: AudioBuffer;
  params: GranularParams;
  visuals: OrbVisuals;
  detectedBpm?: number;
}

export interface Connection {
  id: string;
  fromOrbId: string;
  toOrbId: string;
}

// Default initial parameters for a new orb
export const DEFAULT_GRANULAR_PARAMS: GranularParams = {
  grainSize: 0.1,
  grainDensity: 0.5, // Normalized 0-1
  position: 0,
  randomPitch: 0.2,
  lfoRate: 0.5,
  lfoDepth: 0.0,
  volume: 1.0,
  lfoTarget: 'none',
};