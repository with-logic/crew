"use client";

/*
 * Background grid fidget for the site-only presentation surface.
 * This visual layer does not implement a CLI PRD section.
 * The canvas is visual-only: it never intercepts input, and click waves
 * only trigger from background-like whitespace rather than foreground UI.
 */

import { useEffect, useRef } from "react";
import { configureCanvas } from "./grid-fidget/canvas";
import { CELL_SIZE, colorWithAlpha, snapToGrid } from "./grid-fidget/util";
import type { GridOffset, Palette, Wave } from "./grid-fidget/waves";
import { addWave, drawAndPruneWaves } from "./grid-fidget/waves";

export function GridFidget() {
  const gridRef = useRef<HTMLCanvasElement>(null);
  const effectsRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const gridCanvas = gridRef.current;
    const effectsCanvas = effectsRef.current;
    if (!(gridCanvas && effectsCanvas)) return;

    const gridCtx = gridCanvas.getContext("2d");
    const effectsCtx = effectsCanvas.getContext("2d");
    if (!(gridCtx && effectsCtx)) return;

    const allowMotion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      configureCanvas(gridCanvas, gridCtx, width, height, dpr);
      configureCanvas(effectsCanvas, effectsCtx, width, height, dpr);
      drawStaticGrid();
      schedule();
    };

    const schedule = () => {
      if (animationFrame === 0) animationFrame = requestAnimationFrame(draw);
    };

    const draw = (now: number) => {
      animationFrame = 0;
      effectsCtx.clearRect(0, 0, width, height);
      const offset = gridOffset();
      if (!allowMotion) return;
      if (pointer.active) drawHoverCell(effectsCtx, pointer.x, pointer.y, palette, offset);
      drawAndPruneWaves(effectsCtx, waves, palette, now, offset);
      if (waves.length > 0) schedule();
    };

    const drawStaticGrid = () => {
      gridCtx.clearRect(0, 0, width, height);
      drawGrid(gridCtx, width, height, palette, gridOffset());
    };

    const onScroll = () => {
      drawStaticGrid();
      schedule();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!allowMotion) return;
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
      if (!allowMotion) return;
      if (!shouldStartWave(event)) return;
      addWave(waves, event.clientX, event.clientY, width, height, performance.now());
      schedule();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        inset: 0,
        position: "fixed",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      <canvas ref={gridRef} />
      <canvas ref={effectsRef} />
    </div>
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
  // Alpha values are hand-tuned for the quiet background texture.
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
  ctx.beginPath();
  for (let x = offset.x + 0.5; x <= width; x += CELL_SIZE) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  ctx.stroke();
  ctx.strokeStyle = colorWithAlpha(palette.saffron, 0.075);
  ctx.beginPath();
  for (let y = offset.y + 0.5; y <= height; y += CELL_SIZE) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

function gridOffset(): GridOffset {
  return {
    x: -(window.scrollX % CELL_SIZE),
    y: -(window.scrollY % CELL_SIZE),
  };
}

function shouldStartWave(event: PointerEvent): boolean {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (
    !target ||
    target.closest("a,button,input,textarea,select,summary,[role='button'],[data-no-fidget]")
  ) {
    return false;
  }
  return !target.closest("pre,code,svg,img,canvas,video");
}
