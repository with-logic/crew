"use client";

/*
 * Background grid fidget for the site presentation surface (§16.6).
 * The canvas is visual-only: it never intercepts input, and click waves
 * only trigger from background-like whitespace rather than foreground UI.
 */

import { useEffect, useRef } from "react";
import type { GridOffset, Palette, Wave } from "./grid-fidget/waves";
import { addWave, drawWaves } from "./grid-fidget/waves";

const CELL_SIZE = 18;

export function GridFidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const palette = readPalette();
    const pointer = { x: -1, y: -1, active: false };
    const waves: Wave[] = [];
    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      schedule();
    };

    const schedule = () => {
      if (animationFrame === 0) animationFrame = requestAnimationFrame(draw);
    };

    const draw = (now: number) => {
      animationFrame = 0;
      ctx.clearRect(0, 0, width, height);
      const offset = gridOffset();
      drawGrid(ctx, width, height, palette, offset);
      if (pointer.active) drawHoverCell(ctx, pointer.x, pointer.y, palette, offset);
      drawWaves(ctx, waves, palette, now, offset);
      if (pointer.active || waves.length > 0) schedule();
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      schedule();
    };

    const onPointerLeave = () => {
      pointer.active = false;
      schedule();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!shouldStartWave(event)) return;
      addWave(waves, event.clientX, event.clientY, width, height, performance.now());
      schedule();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        inset: 0,
        position: "fixed",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  return {
    aubergine: styles.getPropertyValue("--aubergine").trim(),
    saffron: styles.getPropertyValue("--saffron").trim(),
  };
}

function drawHoverCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  palette: Palette,
  offset: GridOffset,
) {
  const cellX = snapToGrid(x, offset.x);
  const cellY = snapToGrid(y, offset.y);
  ctx.fillStyle = colorWithAlpha(palette.aubergine, 0.09);
  ctx.fillRect(cellX + 1, cellY + 1, CELL_SIZE - 1, CELL_SIZE - 1);
  ctx.strokeStyle = colorWithAlpha(palette.saffron, 0.38);
  ctx.strokeRect(cellX + 0.5, cellY + 0.5, CELL_SIZE, CELL_SIZE);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  offset: GridOffset,
) {
  ctx.strokeStyle = colorWithAlpha(palette.saffron, 0.065);
  ctx.lineWidth = 1;
  for (let x = offset.x + 0.5; x <= width; x += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.strokeStyle = colorWithAlpha(palette.saffron, 0.075);
  for (let y = offset.y + 0.5; y <= height; y += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function gridOffset(): GridOffset {
  return {
    x: -(window.scrollX % CELL_SIZE),
    y: -(window.scrollY % CELL_SIZE),
  };
}

function snapToGrid(value: number, offset: number): number {
  return Math.floor((value - offset) / CELL_SIZE) * CELL_SIZE + offset;
}

function shouldStartWave(event: PointerEvent): boolean {
  if (!(event.target instanceof Element)) return false;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (!target || target.closest("a,button,input,textarea,select,summary,[role='button']")) {
    return false;
  }
  return !target.closest("pre,code,svg,img,canvas,video");
}

function colorWithAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}
