// Works with both legacy originals/<hash> and new originals/<hash>/<attempt>.
export function imageObjectKey(key: string, size: "original" | "grid" | "detail"): string {
  if (!/^originals\/[a-f0-9]{64}(?:\/[a-f0-9-]{36})?$/.test(key)) {
    throw new Error("Invalid image storage key");
  }
  return size === "original" ? key : `thumbs/${size}/${key.slice("originals/".length)}.webp`;
}
