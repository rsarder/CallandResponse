import type { HandPoint } from './types';

export function handToViewportNdc(point: Pick<HandPoint, 'x' | 'y'>, mirror = true): { x: number; y: number } {
  const x = mirror ? 1 - point.x : point.x;
  return { x: x * 2 - 1, y: 1 - point.y * 2 };
}

export function normalizedPinchDistance(landmarks: readonly HandPoint[]): number {
  const thumb = landmarks[4]; const index = landmarks[8]; const wrist = landmarks[0]; const middleBase = landmarks[9];
  if (!thumb || !index || !wrist || !middleBase) return Number.POSITIVE_INFINITY;
  const pinch = Math.hypot(index.x - thumb.x, index.y - thumb.y);
  const palm = Math.max(0.001, Math.hypot(middleBase.x - wrist.x, middleBase.y - wrist.y));
  return pinch / palm;
}

export function isPinchActive(distance: number, active: boolean): boolean {
  return distance < (active ? 0.52 : 0.34);
}

export function confidentGesture(name: string, score: number, minimum = 0.58): string {
  return score >= minimum ? name : 'None';
}
