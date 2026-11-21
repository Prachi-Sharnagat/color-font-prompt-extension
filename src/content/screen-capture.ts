import { browser } from 'wxt/browser';
import type { RGB } from '../lib/color-conversion';
import type { BackgroundRequest, CaptureResponse } from '../lib/messages';

/**
 * Decoded screenshot of the visible viewport.
 * `scaleX/scaleY` map CSS pixels (clientX/clientY) to screenshot pixels,
 * accounting for retina screens and browser zoom (see pickScale).
 */
export interface PixelSource {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  scaleX: number;
  scaleY: number;
}

export class CaptureError extends Error {}

/** Ask the background worker for a screenshot of the visible tab. */
async function requestCapture(): Promise<string> {
  const request: BackgroundRequest = { type: 'pt:capture' };
  const response = (await browser.runtime.sendMessage(request)) as CaptureResponse | undefined;
  if (!response) throw new CaptureError('No response from background');
  if (!response.ok) throw new CaptureError(response.error);
  return response.dataUrl;
}

/** Decode a data: URL without fetch(), which a strict page CSP could block. */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/png';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function captureViewport(): Promise<PixelSource> {
  // Read the viewport size at request time, before the page can scroll/resize.
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const dataUrl = await requestCapture();
  const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new CaptureError('2D canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    // Read every pixel once; sampling then is a cheap array lookup.
    const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: image.width,
      height: image.height,
      data: image.data,
      scaleX: pickScale(image.width, viewportWidth),
      scaleY: pickScale(image.height, viewportHeight),
    };
  } finally {
    bitmap.close();
  }
}

/**
 * CSS px → screenshot px scale. The screenshot is anchored at the viewport's
 * top-left, so devicePixelRatio (which in Chrome includes page zoom) is exact
 * even if the image omits a scrollbar strip. Fall back to the measured ratio if
 * the two disagree by more than 5% (e.g. an unusual DPR report).
 */
function pickScale(imageSize: number, viewportSize: number): number {
  const dpr = window.devicePixelRatio || 1;
  const measured = imageSize / viewportSize;
  return Math.abs(measured - dpr) / dpr < 0.05 ? dpr : measured;
}

/** Screenshot pixel coordinates for a CSS-pixel client position. */
export function toDevicePixel(src: PixelSource, clientX: number, clientY: number): { x: number; y: number } {
  return {
    x: Math.min(src.width - 1, Math.max(0, Math.floor(clientX * src.scaleX))),
    y: Math.min(src.height - 1, Math.max(0, Math.floor(clientY * src.scaleY))),
  };
}

/** Color of a screenshot pixel, or null if out of bounds. */
export function pixelAt(src: PixelSource, x: number, y: number): RGB | null {
  if (x < 0 || y < 0 || x >= src.width || y >= src.height) return null;
  const i = (y * src.width + x) * 4;
  return { r: src.data[i] ?? 0, g: src.data[i + 1] ?? 0, b: src.data[i + 2] ?? 0 };
}

export function sampleAt(src: PixelSource, clientX: number, clientY: number): RGB | null {
  const { x, y } = toDevicePixel(src, clientX, clientY);
  return pixelAt(src, x, y);
}
