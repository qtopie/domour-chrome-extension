/**
 * TEST-PROXY-ICON-004 — Generate ImageData pixel buffer for dynamic icon rendering.
 * Pure-module tests (no chrome, no browser I/O). Run with:
 *   node --experimental-strip-types testings/proxyIcon/icon.test.ts
 */
import {
  createProfileIconPixelData,
  hexToRgb
} from "../../frontend/src/types/proxyIcon.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("TestProxyIcon_GenerateImageData (SPEC-PI-004)");

// 1. hexToRgb
const rgbGreen = hexToRgb("#10b981");
check("hexToRgb parses #10b981 correctly", rgbGreen.r === 0x10 && rgbGreen.g === 0xb9 && rgbGreen.b === 0x81);

const rgbDefault = hexToRgb("invalid");
check("hexToRgb falls back on invalid hex", rgbDefault.r !== undefined && rgbDefault.g !== undefined && rgbDefault.b !== undefined);

// 2. Pixel data generation (16x16 and 32x32)
for (const size of [16, 32]) {
  const pixelResult = createProfileIconPixelData(size, "#10b981");
  check(`size ${size} has correct width`, pixelResult.width === size);
  check(`size ${size} has correct height`, pixelResult.height === size);
  check(`size ${size} has correct byte length (${size * size * 4})`, pixelResult.data.length === size * size * 4);

  // Check that the buffer has colored pixels with alpha > 0
  let hasProfileColor = false;
  for (let i = 0; i < pixelResult.data.length; i += 4) {
    const r = pixelResult.data[i];
    const g = pixelResult.data[i + 1];
    const b = pixelResult.data[i + 2];
    const a = pixelResult.data[i + 3];

    if (a > 0 && r === 0x10 && g === 0xb9 && b === 0x81) {
      hasProfileColor = true;
      break;
    }
  }
  check(`size ${size} contains target profile color pixels`, hasProfileColor);
}

console.log(failures === 0 ? "\nAll icon tests passed ✅" : `\n${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
