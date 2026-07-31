/**
 * P4-06 — server-side EXIF / location metadata strip for care photo ingest.
 *
 * Pure byte transforms (no Deno.env). Prefer strip all EXIF; durable stored
 * object must not retain GPS/location EXIF. Never log filenames or GPS values.
 */

function u8(bytes: number[]): Uint8Array {
  return new Uint8Array(bytes)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

function readU16be(view: DataView, offset: number): number {
  return view.getUint16(offset, false)
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  )
}

/** True when JPEG/PNG/WebP bytes contain common GPS / EXIF location markers. */
export function hasLocationExif(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false

  // JPEG APP1 Exif
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let i = 2
    while (i + 4 < bytes.length) {
      if (bytes[i] !== 0xff) break
      const marker = bytes[i + 1] ?? 0
      if (marker === 0xda || marker === 0xd9) break // SOS / EOI
      if (marker >= 0xd0 && marker <= 0xd7) {
        i += 2
        continue
      }
      if (i + 4 > bytes.length) break
      const size = readU16be(view, i + 2)
      if (size < 2 || i + 2 + size > bytes.length) break
      if (marker === 0xe1) {
        const start = i + 4
        const end = i + 2 + size
        const seg = bytes.subarray(start, end)
        let ascii = ''
        const n = Math.min(seg.length, 64)
        for (let k = 0; k < n; k++) ascii += String.fromCharCode(seg[k] ?? 0)
        if (/Exif/i.test(ascii) || /GPS/i.test(ascii)) return true
        // GPS IFD tag 0x8825 appears in TIFF header after Exif\0\0
        for (let j = 0; j + 1 < seg.length; j++) {
          if (seg[j] === 0x88 && seg[j + 1] === 0x25) return true
          if (seg[j] === 0x25 && seg[j + 1] === 0x88) return true
        }
      }
      i += 2 + size
    }
    return false
  }

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    let offset = 8
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    while (offset + 12 <= bytes.length) {
      const len = view.getUint32(offset, false)
      const type = fourCC(bytes, offset + 4)
      const dataStart = offset + 8
      const dataEnd = dataStart + len
      if (dataEnd + 4 > bytes.length) break
      if (type === 'eXIf') return true
      if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
        const slice = bytes.subarray(dataStart, Math.min(dataEnd, dataStart + 128))
        const text = String.fromCharCode(...slice)
        if (/gps|latitude|longitude|location/i.test(text)) return true
      }
      offset = dataEnd + 4
      if (type === 'IEND') break
    }
    return false
  }

  // WebP (RIFF....WEBP)
  if (fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP') {
    let offset = 12
    while (offset + 8 <= bytes.length) {
      const type = fourCC(bytes, offset)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const size = view.getUint32(offset + 4, true)
      const dataStart = offset + 8
      const padded = size + (size % 2)
      if (dataStart + padded > bytes.length) break
      if (type === 'EXIF' || type === 'XMP ') return true
      offset = dataStart + padded
    }
  }

  return false
}

/** Strip JPEG APP1 (Exif) segments. Leaves SOF/SOS/image data intact. */
export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return bytes
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Uint8Array[] = [u8([0xff, 0xd8])]
  let i = 2
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      // Entropy-coded segment after SOS — copy remainder.
      out.push(bytes.subarray(i))
      break
    }
    const marker = bytes[i + 1] ?? 0
    if (marker === 0xd9) {
      out.push(u8([0xff, 0xd9]))
      break
    }
    if (marker === 0xda) {
      // SOS + rest of file
      out.push(bytes.subarray(i))
      break
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(u8([0xff, marker]))
      i += 2
      continue
    }
    if (i + 4 > bytes.length) {
      out.push(bytes.subarray(i))
      break
    }
    const size = readU16be(view, i + 2)
    if (size < 2 || i + 2 + size > bytes.length) {
      out.push(bytes.subarray(i))
      break
    }
    // Drop APP1 (Exif) and APP13 (Photoshop IRB often carries GPS trails).
    if (marker === 0xe1 || marker === 0xed) {
      i += 2 + size
      continue
    }
    out.push(bytes.subarray(i, i + 2 + size))
    i += 2 + size
  }
  return concat(out)
}

/** Strip PNG eXIf and location-bearing text chunks. */
export function stripPngExif(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return bytes
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Uint8Array[] = [bytes.subarray(0, 8)]
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const len = view.getUint32(offset, false)
    const type = fourCC(bytes, offset + 4)
    const chunkEnd = offset + 8 + len + 4
    if (chunkEnd > bytes.length) {
      out.push(bytes.subarray(offset))
      break
    }
    let drop = type === 'eXIf'
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const data = bytes.subarray(offset + 8, offset + 8 + len)
      const text = String.fromCharCode(...data.subarray(0, Math.min(data.length, 256)))
      if (/gps|latitude|longitude|location/i.test(text)) drop = true
    }
    if (!drop) out.push(bytes.subarray(offset, chunkEnd))
    offset = chunkEnd
    if (type === 'IEND') break
  }
  return concat(out)
}

/** Strip WebP EXIF / XMP chunks; rebuild RIFF size. */
export function stripWebpExif(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 12 || fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WEBP') {
    return bytes
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const kept: Uint8Array[] = []
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = fourCC(bytes, offset)
    const size = view.getUint32(offset + 4, true)
    const dataStart = offset + 8
    const padded = size + (size % 2)
    const chunkEnd = dataStart + padded
    if (chunkEnd > bytes.length) break
    if (type !== 'EXIF' && type !== 'XMP ') {
      kept.push(bytes.subarray(offset, chunkEnd))
    }
    offset = chunkEnd
  }
  const body = concat(kept)
  const out = new Uint8Array(12 + body.length)
  out.set(u8([0x52, 0x49, 0x46, 0x46]), 0) // RIFF
  const outView = new DataView(out.buffer)
  outView.setUint32(4, 4 + body.length, true) // file size after this field
  out.set(u8([0x57, 0x45, 0x42, 0x50]), 8) // WEBP
  out.set(body, 12)
  return out
}

/**
 * Strip location/EXIF metadata by content-type.
 * Returns original bytes when format is unrecognized (caller should have MIME-gated).
 */
export function stripImageExif(bytes: Uint8Array, contentType: string): Uint8Array {
  const mime = contentType.toLowerCase().split(';')[0]?.trim() || ''
  if (mime === 'image/jpeg' || mime === 'image/jpg') return stripJpegExif(bytes)
  if (mime === 'image/png') return stripPngExif(bytes)
  if (mime === 'image/webp') return stripWebpExif(bytes)
  return bytes
}
