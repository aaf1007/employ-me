import { inflateRawSync } from 'node:zlib';

// Just enough of the ZIP format to read a DOCX: the central directory, then
// stored or deflated entries. No ZIP64; Resumes are far below 4 GB.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly localOffset: number;
}

/** Every entry name in the archive, or null when it isn't a readable ZIP. */
export function zipEntryNames(zip: Buffer): string[] | null {
  return centralDirectory(zip)?.map((entry) => entry.name) ?? null;
}

/** One entry's bytes, capped at `maxBytes` uncompressed (a zip bomb is just unreadable). */
export function readZipEntry(zip: Buffer, name: string, maxBytes: number): Buffer | null {
  const entry = centralDirectory(zip)?.find((candidate) => candidate.name === name);
  if (entry === undefined || entry.localOffset + 30 > zip.length) return null;
  if (zip.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE) return null;
  const start =
    entry.localOffset +
    30 +
    zip.readUInt16LE(entry.localOffset + 26) +
    zip.readUInt16LE(entry.localOffset + 28);
  const data = zip.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.length <= maxBytes ? Buffer.from(data) : null;
  if (entry.method !== 8) return null;
  try {
    return inflateRawSync(data, { maxOutputLength: maxBytes });
  } catch {
    return null;
  }
}

function centralDirectory(zip: Buffer): ZipEntry[] | null {
  const eocd = findEocd(zip);
  if (eocd === null) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) return null;
    const nameLength = zip.readUInt16LE(offset + 28);
    entries.push({
      method: zip.readUInt16LE(offset + 10),
      compressedSize: zip.readUInt32LE(offset + 20),
      localOffset: zip.readUInt32LE(offset + 42),
      name: zip.toString('utf8', offset + 46, offset + 46 + nameLength),
    });
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return entries;
}

/** The end-of-central-directory record sits in the last 64 KB + 22 bytes. */
function findEocd(zip: Buffer): number | null {
  const lowest = Math.max(0, zip.length - 65_557);
  for (let offset = zip.length - 22; offset >= lowest; offset--) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return null;
}
