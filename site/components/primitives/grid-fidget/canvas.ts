/*
 * Canvas sizing helper for the site-only background fidget.
 * This visual layer does not implement a CLI PRD section.
 */

export function configureCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
) {
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.inset = "0";
  canvas.style.position = "absolute";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
