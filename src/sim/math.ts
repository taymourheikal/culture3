import type { Vec2 } from "./types";

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalize(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.0001) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

export function wrapPosition(position: Vec2, width: number, height: number): Vec2 {
  return {
    x: (position.x + width) % width,
    y: (position.y + height) % height,
  };
}
