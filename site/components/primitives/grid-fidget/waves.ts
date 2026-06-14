/*
 * Wave drawing helpers for the site-only background fidget.
 * This visual layer does not implement a CLI PRD section.
 */

import { CELL_SIZE, colorWithAlpha, snapToGrid } from "./util";

const WAVE_BAND = CELL_SIZE * 2.7;
const WAVE_SPEED = 0.72;
const WAVE_SEGMENTS = 96;
const MAX_WAVES = 64;
const RING_OFFSETS = [-20, -10, 0, 10, 20];
const RING_FADE_SPAN = Math.max(...RING_OFFSETS.map(Math.abs)) + 8;

export type Wave = {
  readonly born: number;
  readonly maxRadius: number;
  readonly x: number;
  readonly y: number;
};

export type Palette = {
  readonly aubergine: string;
  readonly saffron: string;
};

export type GridOffset = {
  readonly x: number;
  readonly y: number;
};

/** Draw active waves and remove expired waves from the passed array. */
export function drawAndPruneWaves(
  ctx: CanvasRenderingContext2D,
  waves: Wave[],
  palette: Palette,
  now: number,
  offset: GridOffset,
) {
  for (let index = waves.length - 1; index >= 0; index -= 1) {
    const wave = waves[index]!;
    const radius = (now - wave.born) * WAVE_SPEED;
    if (radius > wave.maxRadius + WAVE_BAND) {
      waves.splice(index, 1);
      continue;
    }
    const fade = Math.max(0, 1 - radius / (wave.maxRadius + WAVE_BAND));
    drawWaveRing(ctx, wave, radius, fade, palette, now);
    drawWaveCells(ctx, wave, radius, fade, palette, offset);
  }
}

export function addWave(
  waves: Wave[],
  x: number,
  y: number,
  width: number,
  height: number,
  now: number,
) {
  waves.push({
    born: now,
    maxRadius: Math.hypot(Math.max(x, width - x), Math.max(y, height - y)),
    x,
    y,
  });
  if (waves.length > MAX_WAVES) waves.splice(0, waves.length - MAX_WAVES);
}

function drawWaveRing(
  ctx: CanvasRenderingContext2D,
  wave: Wave,
  radius: number,
  fade: number,
  palette: Palette,
  now: number,
) {
  for (const offset of RING_OFFSETS) {
    const strength = 1 - Math.abs(offset) / RING_FADE_SPAN;
    ctx.beginPath();
    drawRingPath(ctx, wave, radius + offset, now);
    ctx.strokeStyle = colorWithAlpha(palette.aubergine, fade * strength * 0.18);
    ctx.lineWidth = offset === 0 ? 2.4 : 1.2;
    ctx.stroke();
  }
}

function drawRingPath(ctx: CanvasRenderingContext2D, wave: Wave, radius: number, now: number) {
  for (let index = 0; index <= WAVE_SEGMENTS; index += 1) {
    const angle = (index / WAVE_SEGMENTS) * Math.PI * 2;
    const ripple = Math.sin(angle * 9 + now * 0.007) * 4 + Math.sin(angle * 5 - now * 0.004) * 3;
    const ringRadius = Math.max(0, radius + ripple);
    const x = wave.x + Math.cos(angle) * ringRadius;
    const y = wave.y + Math.sin(angle) * ringRadius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function drawWaveCells(
  ctx: CanvasRenderingContext2D,
  wave: Wave,
  radius: number,
  fade: number,
  palette: Palette,
  offset: GridOffset,
) {
  const fromY = snapToGrid(Math.max(0, wave.y - radius - WAVE_BAND), offset.y);
  const toY = snapToGrid(wave.y + radius + WAVE_BAND + CELL_SIZE, offset.y);
  const outerRadius = radius + WAVE_BAND;
  const innerRadius = Math.max(0, radius - WAVE_BAND);
  const outerSquared = outerRadius * outerRadius;
  const innerSquared = innerRadius * innerRadius;

  for (let cellY = fromY; cellY <= toY; cellY += CELL_SIZE) {
    const centerY = cellY + CELL_SIZE / 2;
    const dy = centerY - wave.y;
    const dySquared = dy * dy;
    if (dySquared > outerSquared) continue;
    const outerDx = Math.sqrt(outerSquared - dySquared);
    if (innerRadius > 0 && dySquared < innerSquared) {
      const innerDx = Math.sqrt(innerSquared - dySquared);
      drawWaveCellRange(
        ctx,
        wave,
        radius,
        fade,
        palette,
        offset,
        cellY,
        wave.x - outerDx,
        wave.x - innerDx,
      );
      drawWaveCellRange(
        ctx,
        wave,
        radius,
        fade,
        palette,
        offset,
        cellY,
        wave.x + innerDx,
        wave.x + outerDx,
      );
      continue;
    }
    drawWaveCellRange(
      ctx,
      wave,
      radius,
      fade,
      palette,
      offset,
      cellY,
      wave.x - outerDx,
      wave.x + outerDx,
    );
  }
}

function drawWaveCellRange(
  ctx: CanvasRenderingContext2D,
  wave: Wave,
  radius: number,
  fade: number,
  palette: Palette,
  offset: GridOffset,
  cellY: number,
  fromX: number,
  toX: number,
) {
  const fromCellX = snapToGrid(Math.max(0, fromX - CELL_SIZE / 2), offset.x);
  const toCellX = snapToGrid(toX + CELL_SIZE / 2, offset.x);
  for (let cellX = fromCellX; cellX <= toCellX; cellX += CELL_SIZE) {
    drawWaveCell(ctx, wave, radius, fade, palette, cellX, cellY);
  }
}

function drawWaveCell(
  ctx: CanvasRenderingContext2D,
  wave: Wave,
  radius: number,
  fade: number,
  palette: Palette,
  cellX: number,
  cellY: number,
) {
  const centerX = cellX + CELL_SIZE / 2;
  const centerY = cellY + CELL_SIZE / 2;
  const front = 1 - Math.abs(Math.hypot(centerX - wave.x, centerY - wave.y) - radius) / WAVE_BAND;
  if (front <= 0) return;
  const lift = Math.sin(front * Math.PI) * 3;
  const alpha = front * fade * 0.18;
  ctx.fillStyle = colorWithAlpha(palette.aubergine, alpha);
  ctx.fillRect(cellX + 1, cellY + 1 - lift, CELL_SIZE - 2, CELL_SIZE - 2);
  ctx.strokeStyle = colorWithAlpha(palette.saffron, alpha * 1.8);
  ctx.strokeRect(cellX + 0.5, cellY + 0.5 - lift, CELL_SIZE - 1, CELL_SIZE - 1);
}
