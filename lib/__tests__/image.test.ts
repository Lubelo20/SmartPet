import { describe, expect, it } from "vitest";
import {
  PHOTO_MAX_BYTES, PHOTO_MAX_EDGE, dataUrlBytes, isSupportedImageType, scaleToFit,
} from "@/lib/image";

describe("scaleToFit", () => {
  it("shrinks the long edge to the cap and keeps the aspect ratio", () => {
    expect(scaleToFit(1024, 768, 512)).toEqual({ width: 512, height: 384 });
    expect(scaleToFit(768, 1024, 512)).toEqual({ width: 384, height: 512 });
  });

  it("never upscales a small image", () => {
    expect(scaleToFit(200, 100, 512)).toEqual({ width: 200, height: 100 });
  });

  it("rounds to whole pixels", () => {
    const { width, height } = scaleToFit(1000, 333, 512);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  it("keeps a square square", () => {
    expect(scaleToFit(2048, 2048, 512)).toEqual({ width: 512, height: 512 });
  });
});

describe("isSupportedImageType", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (t) => {
    expect(isSupportedImageType(t)).toBe(true);
  });

  it.each(["image/gif", "application/pdf", "text/html", ""])("rejects %s", (t) => {
    expect(isSupportedImageType(t)).toBe(false);
  });
});

describe("dataUrlBytes", () => {
  it("reports the decoded size of the base64 payload", () => {
    // "AAAA" decodes to 3 bytes.
    expect(dataUrlBytes("data:image/jpeg;base64,AAAA")).toBe(3);
  });

  it("accounts for padding", () => {
    // "AA==" decodes to 1 byte; "AAA=" to 2.
    expect(dataUrlBytes("data:image/jpeg;base64,AA==")).toBe(1);
    expect(dataUrlBytes("data:image/jpeg;base64,AAA=")).toBe(2);
  });

  it("treats a malformed value as oversized rather than acceptable", () => {
    // A string with no base64 marker cannot be stored; erring small would let
    // it through the size gate and fail later, deeper in Firestore.
    expect(dataUrlBytes("not-a-data-url")).toBeGreaterThan(PHOTO_MAX_BYTES);
  });
});

describe("limits", () => {
  it("keeps the photo cap comfortably under Firestore's 1 MiB document limit", () => {
    expect(PHOTO_MAX_BYTES).toBeLessThanOrEqual(300_000);
    expect(PHOTO_MAX_EDGE).toBeLessThanOrEqual(1024);
  });
});
