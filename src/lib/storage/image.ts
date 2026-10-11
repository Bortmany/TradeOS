// TradeOS — what a picture REALLY is, decided from its own bytes. The file's
// name and the type the browser claimed are never trusted. Only PNG, JPEG and
// WebP pass; text, HTML, SVG and everything else is refused.
//
// For JPEGs this also removes the hidden metadata that can carry a phone's GPS
// position (EXIF and XMP live in APP1 segments; IPTC in APP13). The picture data
// itself is copied byte for byte, so nothing is re-compressed. The one thing we
// keep is the EXIF "orientation" flag, rewritten as a tiny EXIF block holding only
// that number, so portrait photos still show upright. PNGs lose their eXIf and text
// (XMP) chunks and WebPs their EXIF and XMP chunks the same lossless way.

import type { ImageExtension } from "./keys";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface SniffedImage {
  mime: "image/png" | "image/jpeg" | "image/webp";
  ext: ImageExtension;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(buf: Buffer, start: number, end: number): string {
  return buf.subarray(start, end).toString("latin1");
}

/** Identify the picture from its leading bytes, or null if it isn't a PNG/JPEG/WebP. */
export function sniffImage(buf: Buffer): SniffedImage | null {
  if (buf.length >= 33 && PNG_SIGNATURE.every((b, i) => buf[i] === b) && ascii(buf, 12, 16) === "IHDR") {
    return { mime: "image/png", ext: "png" };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    buf.length >= 16 &&
    ascii(buf, 0, 4) === "RIFF" &&
    ascii(buf, 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(ascii(buf, 12, 16))
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

/** Read the EXIF orientation (2-8) out of an Exif APP1 payload, or null (null also for "upright"). */
function exifOrientation(payload: Buffer): number | null {
  // payload = "Exif\0\0" + TIFF block
  if (payload.length < 14 || ascii(payload, 0, 4) !== "Exif") return null;
  const tiff = payload.subarray(6);
  const little = ascii(tiff, 0, 2) === "II";
  if (!little && ascii(tiff, 0, 2) !== "MM") return null;
  const u16 = (o: number) =>
    o >= 0 && o + 2 <= tiff.length ? (little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o)) : -1;
  const u32 = (o: number) =>
    o >= 0 && o + 4 <= tiff.length ? (little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o)) : -1;
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd < 8) return null;
  const count = u16(ifd);
  if (count < 0 || count > 200) return null;
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 2 && v <= 8 ? v : null;
    }
  }
  return null;
}

function orientationSegment(orientation: number): Buffer {
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian header, first IFD at byte 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // orientation (SHORT)
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

function withOrientation(parts: Buffer[], orientation: number | null): Buffer {
  if (orientation === null) return Buffer.concat(parts);
  return Buffer.concat([parts[0], orientationSegment(orientation), ...parts.slice(1)]);
}

/**
 * Remove location-bearing metadata from a JPEG without touching the picture.
 * Returns null when the bytes are not a well-formed JPEG (the upload is refused).
 */
export function stripJpegMetadata(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let orientation: number | null = null;
  let pos = 2;

  while (pos < buf.length) {
    if (buf[pos] !== 0xff) return null;
    const segStart = pos;
    while (pos < buf.length && buf[pos] === 0xff) pos++; // fill bytes
    if (pos >= buf.length) return null;
    const marker = buf[pos++];

    if (marker === 0xd9) {
      // End of image before any scan: not a real picture.
      return null;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      parts.push(buf.subarray(segStart, pos));
      continue;
    }
    if (pos + 2 > buf.length) return null;
    const length = buf.readUInt16BE(pos);
    const end = pos + length;
    if (length < 2 || end > buf.length) return null;

    if (marker === 0xe1 || marker === 0xed) {
      // APP1 (EXIF / XMP) and APP13 (IPTC): dropped. Keep only the orientation flag.
      if (marker === 0xe1 && orientation === null) {
        orientation = exifOrientation(buf.subarray(pos + 2, end));
      }
    } else {
      parts.push(buf.subarray(segStart, end));
    }
    pos = end;

    if (marker === 0xda) {
      // Start of scan: the compressed picture follows; copy everything left untouched.
      parts.push(buf.subarray(pos));
      return withOrientation(parts, orientation);
    }
  }
  return null;
}

/**
 * Remove location-bearing metadata from a PNG: the eXIf chunk and every text chunk
 * (iTXt / tEXt / zTXt — XMP lives in iTXt, and some tools tuck EXIF into the others).
 * Every other chunk is copied byte for byte; anything after IEND is dropped.
 * Returns null when the bytes are not a well-formed PNG (the upload is refused).
 */
export function stripPngMetadata(buf: Buffer): Buffer | null {
  if (buf.length < 33 || !PNG_SIGNATURE.every((b, i) => buf[i] === b)) return null;
  const parts: Buffer[] = [buf.subarray(0, 8)];
  const DROP = new Set(["eXIf", "iTXt", "tEXt", "zTXt"]);
  let pos = 8;
  let first = true;
  while (pos + 12 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = ascii(buf, pos + 4, pos + 8);
    const end = pos + 12 + length; // length + type + data + CRC
    if (length > 0x7fffffff || end > buf.length) return null;
    if (!/^[A-Za-z]{4}$/.test(type)) return null;
    if (first && (type !== "IHDR" || length !== 13)) return null;
    first = false;
    if (!DROP.has(type)) parts.push(buf.subarray(pos, end));
    pos = end;
    if (type === "IEND") return Buffer.concat(parts);
  }
  return null; // no IEND: cut off or not a whole picture
}

/**
 * Remove EXIF and XMP from a WebP (RIFF container) without touching the picture.
 * The EXIF / XMP chunks are dropped, the matching "has EXIF" / "has XMP" flags in
 * the VP8X header are cleared, and the RIFF size is rewritten to match. All other
 * chunks (and their padding) are copied byte for byte.
 * Returns null when the bytes are not a well-formed WebP (the upload is refused).
 */
export function stripWebpMetadata(buf: Buffer): Buffer | null {
  if (buf.length < 20 || ascii(buf, 0, 4) !== "RIFF" || ascii(buf, 8, 12) !== "WEBP") return null;
  const riffEnd = 8 + buf.readUInt32LE(4);
  if (riffEnd > buf.length || riffEnd < 20) return null;
  const parts: Buffer[] = [];
  let pos = 12;
  let index = 0;
  let sawPicture = false;
  while (pos < riffEnd) {
    if (pos + 8 > riffEnd) return null;
    const fourcc = ascii(buf, pos, pos + 4);
    const length = buf.readUInt32LE(pos + 4);
    const dataEnd = pos + 8 + length;
    if (dataEnd > riffEnd) return null;
    const end = dataEnd + (length & 1); // chunks are padded to an even size
    if (end > riffEnd) return null;
    if (index === 0 && !["VP8 ", "VP8L", "VP8X"].includes(fourcc)) return null;
    if (index > 0 && fourcc === "VP8X") return null;
    if (fourcc === "VP8 " || fourcc === "VP8L" || fourcc === "ANMF") sawPicture = true;

    if (fourcc === "EXIF" || fourcc === "XMP ") {
      // dropped
    } else if (fourcc === "VP8X") {
      if (length < 10) return null;
      const chunk = Buffer.from(buf.subarray(pos, end));
      chunk[8] &= ~(0x08 | 0x04); // clear the EXIF and XMP flags
      parts.push(chunk);
    } else {
      parts.push(buf.subarray(pos, end));
    }
    pos = end;
    index++;
  }
  if (!sawPicture) return null;
  const body = Buffer.concat(parts);
  const head = Buffer.from("RIFF\0\0\0\0WEBP", "latin1");
  head.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([head, body]);
}
