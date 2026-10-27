import { describe, expect, it } from 'vitest';
import { confidentGesture, handToViewportNdc, isPinchActive, normalizedPinchDistance } from './math';
import type { HandPoint } from './types';

function landmarks(thumbX: number): HandPoint[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0.4, y: 0.5, z: 0 }));
  points[0] = { x: 0.4, y: 0.7, z: 0 };
  points[9] = { x: 0.4, y: 0.5, z: 0 };
  points[4] = { x: thumbX, y: 0.5, z: 0 };
  points[8] = { x: 0.4, y: 0.5, z: 0 };
  return points;
}

describe('gesture math', () => {
  it('mirrors pointer coordinates exactly once and maps them to NDC', () => {
    expect(handToViewportNdc({ x: 0.2, y: 0.25 }).x).toBeCloseTo(0.6);
    expect(handToViewportNdc({ x: 0.2, y: 0.25 }).y).toBeCloseTo(0.5);
    expect(handToViewportNdc({ x: 0.2, y: 0.25 }, false).x).toBeCloseTo(-0.6);
    expect(handToViewportNdc({ x: 0.2, y: 0.25 }, false).y).toBeCloseTo(0.5);
  });

  it('normalizes pinch distance against hand size', () => {
    expect(normalizedPinchDistance(landmarks(0.42))).toBeCloseTo(0.1);
    expect(normalizedPinchDistance([])).toBe(Number.POSITIVE_INFINITY);
  });

  it('uses separate close and release thresholds to prevent pinch chatter', () => {
    expect(isPinchActive(0.33, false)).toBe(true);
    expect(isPinchActive(0.4, false)).toBe(false);
    expect(isPinchActive(0.5, true)).toBe(true);
    expect(isPinchActive(0.53, true)).toBe(false);
  });

  it('discards low-confidence canned poses', () => {
    expect(confidentGesture('Victory', 0.7)).toBe('Victory');
    expect(confidentGesture('Victory', 0.4)).toBe('None');
  });
});
