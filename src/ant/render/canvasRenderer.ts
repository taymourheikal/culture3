import { distance } from "../sim/math";
import type { Agent, WorldState } from "../sim/types";
import { fitCamera, screenToWorld, worldToScreen, type Camera } from "./camera";

export function resizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (context) {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

export function renderWorld(canvas: HTMLCanvasElement, world: WorldState, selectedAgentId: number | null) {
  resizeCanvas(canvas);
  const context = canvas.getContext("2d");
  if (!context) return null;

  const camera = fitCamera(canvas, world.config);
  context.clearRect(0, 0, camera.width, camera.height);
  drawBackdrop(context, camera);
  drawPatches(context, world, camera);
  drawFood(context, world, camera);
  drawAgents(context, world, camera, selectedAgentId);
  drawWorldFrame(context, world, camera);
  return camera;
}

export function pickAgent(canvas: HTMLCanvasElement, world: WorldState, clientX: number, clientY: number) {
  const camera = fitCamera(canvas, world.config);
  const rect = canvas.getBoundingClientRect();
  const point = screenToWorld({ x: clientX - rect.left, y: clientY - rect.top }, camera);

  let selected: Agent | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const agent of world.agents) {
    const candidate = distance(point, agent.position);
    if (candidate < best && candidate <= Math.max(16, agent.radius * 2.4)) {
      selected = agent;
      best = candidate;
    }
  }
  return selected;
}

function drawBackdrop(context: CanvasRenderingContext2D, camera: Camera) {
  const gradient = context.createLinearGradient(0, 0, camera.width, camera.height);
  gradient.addColorStop(0, "#111719");
  gradient.addColorStop(0.55, "#18201d");
  gradient.addColorStop(1, "#141725");
  context.fillStyle = gradient;
  context.fillRect(0, 0, camera.width, camera.height);
}

function drawPatches(context: CanvasRenderingContext2D, world: WorldState, camera: Camera) {
  for (const patch of world.foodPatches) {
    const center = worldToScreen(patch.center, camera);
    const radius = patch.radius * camera.scale;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(86, 143, 86, ${0.035 + patch.richness * 0.035})`;
    context.fill();
  }
}

function drawFood(context: CanvasRenderingContext2D, world: WorldState, camera: Camera) {
  context.fillStyle = "#86d87a";
  for (const food of world.food) {
    const point = worldToScreen(food.position, camera);
    context.beginPath();
    context.arc(point.x, point.y, Math.max(1.2, food.radius * camera.scale), 0, Math.PI * 2);
    context.fill();
  }
}

function drawAgents(context: CanvasRenderingContext2D, world: WorldState, camera: Camera, selectedAgentId: number | null) {
  for (const agent of world.agents) {
    const point = worldToScreen(agent.position, camera);
    const heading = Math.atan2(agent.velocity.y, agent.velocity.x);
    const radius = Math.max(2.5, agent.radius * camera.scale);

    context.save();
    context.translate(point.x, point.y);
    context.rotate(heading);

    context.beginPath();
    context.moveTo(radius * 1.45, 0);
    context.lineTo(-radius, radius * 0.78);
    context.lineTo(-radius * 0.65, 0);
    context.lineTo(-radius, -radius * 0.78);
    context.closePath();
    context.fillStyle = agent.color;
    context.globalAlpha = 0.76 + Math.min(0.24, agent.energy / 600);
    context.fill();

    context.globalAlpha = 0.7;
    context.strokeStyle = agent.health < 35 ? "#ffb2a1" : "rgba(255,255,255,0.42)";
    context.lineWidth = Math.max(0.75, camera.scale * 1.5);
    context.stroke();
    context.restore();

    if (selectedAgentId === agent.id) {
      context.beginPath();
      context.arc(point.x, point.y, radius * 2.5, 0, Math.PI * 2);
      context.strokeStyle = "#ffffff";
      context.lineWidth = 2;
      context.stroke();
    }
  }
}

function drawWorldFrame(context: CanvasRenderingContext2D, world: WorldState, camera: Camera) {
  context.strokeStyle = "rgba(255,255,255,0.16)";
  context.lineWidth = 1;
  context.strokeRect(camera.offsetX, camera.offsetY, world.config.width * camera.scale, world.config.height * camera.scale);
}
