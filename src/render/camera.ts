import type { Vec2, WorldConfig } from "../sim/types";

export type Camera = {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export function fitCamera(canvas: HTMLCanvasElement, config: WorldConfig): Camera {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const scale = Math.min(width / config.width, height / config.height);
  return {
    scale,
    offsetX: (width - config.width * scale) / 2,
    offsetY: (height - config.height * scale) / 2,
    width,
    height,
  };
}

export function worldToScreen(position: Vec2, camera: Camera): Vec2 {
  return {
    x: position.x * camera.scale + camera.offsetX,
    y: position.y * camera.scale + camera.offsetY,
  };
}

export function screenToWorld(position: Vec2, camera: Camera): Vec2 {
  return {
    x: (position.x - camera.offsetX) / camera.scale,
    y: (position.y - camera.offsetY) / camera.scale,
  };
}
