export interface HandPoint {
  x: number;
  y: number;
  z: number;
}

export interface TrackedHand {
  landmarks: HandPoint[];
  worldLandmarks: HandPoint[];
  gesture: string;
  confidence: number;
  handedness: string;
}

export interface GestureFrame {
  hands: TrackedHand[];
  timestamp: number;
}

export type GestureStatus = 'off' | 'requesting' | 'loading' | 'tracking' | 'error';
