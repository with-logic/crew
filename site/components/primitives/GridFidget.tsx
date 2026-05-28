"use client";

/*
 * Background grid fidget for the site presentation surface (§16.6).
 * The canvas is visual-only: it never intercepts input, and click bursts
 * only trigger from background-like whitespace rather than foreground UI.
 */

import { useEffect, useRef } from "react";

const CELL_SIZE = 18;
const MAX_PARTICLES = 120;

type Particle = {
  readonly born: number;
  readonly size: number;
  readonly spin: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

type Palette = {
  readonly aubergine: string;
  readonly saffron: string;
};

export function GridFidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const palette = readPalette();
    const pointer = { x: -1, y: -1, active: false };
    const particles: Particle[] = [];
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
      if (pointer.active) drawHoverCell(ctx, pointer.x, pointer.y, palette);
      drawParticles(ctx, particles, palette, now);
      if (pointer.active || particles.length > 0) schedule();
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
      if (!isBackgroundClick(event.target)) return;
      burstFromCell(particles, event.clientX, event.clientY, performance.now());
      schedule();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        inset: 0,
        position: "fixed",
        pointerEvents: "none",
        zIndex: 2,
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

function drawHoverCell(ctx: CanvasRenderingContext2D, x: number, y: number, palette: Palette) {
  const cellX = Math.floor(x / CELL_SIZE) * CELL_SIZE;
  const cellY = Math.floor(y / CELL_SIZE) * CELL_SIZE;
  ctx.fillStyle = colorWithAlpha(palette.aubergine, 0.09);
  ctx.fillRect(cellX + 1, cellY + 1, CELL_SIZE - 1, CELL_SIZE - 1);
  ctx.strokeStyle = colorWithAlpha(palette.saffron, 0.38);
  ctx.strokeRect(cellX + 0.5, cellY + 0.5, CELL_SIZE, CELL_SIZE);
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  palette: Palette,
  now: number,
) {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index]!;
    const age = now - particle.born;
    if (age > particle.life) {
      particles.splice(index, 1);
      continue;
    }
    const progress = age / particle.life;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.045;
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(progress * particle.spin);
    ctx.fillStyle = colorWithAlpha(palette.aubergine, (1 - progress) * 0.26);
    ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
    ctx.restore();
  }
}

function burstFromCell(particles: Particle[], x: number, y: number, now: number) {
  const baseX = Math.floor(x / CELL_SIZE) * CELL_SIZE + CELL_SIZE / 2;
  const baseY = Math.floor(y / CELL_SIZE) * CELL_SIZE + CELL_SIZE / 2;
  for (let index = 0; index < 18; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.7 + Math.random() * 1.6;
    particles.push({
      born: now,
      life: 620 + Math.random() * 380,
      size: 4 + Math.random() * 7,
      spin: Math.random() * 4 - 2,
      x: baseX,
      y: baseY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.6,
    });
  }
  if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
}

function isBackgroundClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const foreground = target.closest(
    "a,button,input,textarea,select,summary,details,pre,code,h1,h2,h3,h4,p,li,span,strong,em,small,svg,img,[role='button']",
  );
  if (foreground) return false;
  if (target.matches("body,main,section")) return true;
  return target instanceof HTMLElement && target.textContent?.trim() === "";
}

function colorWithAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}
