import { createHash } from "node:crypto";
import sharp from "sharp";

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * 64-bit dHash (difference hash) — robust to re-encoding, format conversion,
 * resizing, and minor JPEG quality changes; sensitive to actual edits like
 * crops, rotations, and recolors. Steps:
 *   1. Greyscale + resize to 9×8 with `fit: "fill"` so any aspect ratio
 *      collapses to the same grid.
 *   2. For each row, set bit `i` if pixel[i+1] > pixel[i]. 8 bits/row × 8
 *      rows = 64 bits.
 * Returned as a 16-char hex string (zero-padded) for compact storage.
 */
export async function dhash(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hi = 0; // top 32 bits
  let lo = 0; // bottom 32 bits
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      const bit = right > left ? 1 : 0;
      const bitIndex = row * 8 + col; // 0..63, MSB first
      if (bitIndex < 32) hi = (hi << 1) | bit;
      else lo = (lo << 1) | bit;
    }
  }
  // `>>> 0` coerces to unsigned 32-bit before hex.
  return (
    (hi >>> 0).toString(16).padStart(8, "0") +
    (lo >>> 0).toString(16).padStart(8, "0")
  );
}

/**
 * Hamming distance between two 16-char hex hashes (64-bit). Splits each into
 * two 32-bit halves so the popcount stays in safe integer range without
 * BigInt overhead. Returns 0..64 (lower = more similar).
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 64;
  const aHi = parseInt(a.slice(0, 8), 16);
  const aLo = parseInt(a.slice(8, 16), 16);
  const bHi = parseInt(b.slice(0, 8), 16);
  const bLo = parseInt(b.slice(8, 16), 16);
  return popcount32((aHi ^ bHi) >>> 0) + popcount32((aLo ^ bLo) >>> 0);
}

// Bit-twiddle popcount, faster than a loop for 32-bit integers.
function popcount32(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  n = (n + (n >>> 4)) & 0x0f0f0f0f;
  return (n * 0x01010101) >>> 24;
}
