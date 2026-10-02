#!/usr/bin/env node
// Makes the PNG app icons from src/app/icon.svg (iPhone home-screen icons cannot
// be SVG). Run once after changing the SVG:  node scripts/make-icons.mjs
// Needs `sharp` (already installed with Next.js). Writes into public/.
//   icon-192.png, icon-512.png ........ the normal icon (rounded corners)
//   icon-maskable-512.png ............. full-bleed, artwork inside the safe zone
//   apple-touch-icon.png (180) ........ full-bleed (iOS rounds it itself)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const svg = readFileSync(`${root}src/app/icon.svg`, "utf8");

// The artwork (everything but the background plate), shrunk to 80% so a round or
// squircle crop never cuts it, on a full-square dark plate.
const art = svg.match(/<path[\s\S]*<\/defs>/)?.[0] ?? "";
const fullBleed = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0b0f1a"/>
  <g transform="translate(51.2 51.2) scale(0.8)">${art}</g>
</svg>`;

const out = (name) => `${root}public/${name}`;
await sharp(Buffer.from(svg)).resize(192, 192).png().toFile(out("icon-192.png"));
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(out("icon-512.png"));
await sharp(Buffer.from(fullBleed)).resize(512, 512).png().toFile(out("icon-maskable-512.png"));
await sharp(Buffer.from(fullBleed)).resize(180, 180).png().toFile(out("apple-touch-icon.png"));
console.log("icons written to public/");
