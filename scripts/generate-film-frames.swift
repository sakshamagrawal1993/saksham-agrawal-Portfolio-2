// Generates the scroll-scrubbed frame sequence for the "A doctor's attention, built in."
// section from the source ambient film.
//
// Requires macOS (uses AVFoundation to decode and `sips` to encode AVIF). There is no
// ffmpeg dependency, so this runs on a stock Mac.
//
//   swift scripts/generate-film-frames.swift <source.mp4> public/film
//
// Writes <outDir>/<width>/f000.avif … and a poster.jpg. Frames are cropped to drop the
// bottom strip of the source, which carries the generator's watermark; CROP_BOTTOM is the
// single knob controlling that.

import AVFoundation
import AppKit
import Foundation

let FRAME_COUNT = 60
// Widths are capped by the source: emitting frames wider than the video's native width would
// upscale for nothing. 1280 matches both the source and the band's max-w-[80rem] container.
let WIDTHS = [1280, 800]
let CROP_BOTTOM = 0.06 // fraction of source height removed from the bottom
// Measured against a near-lossless render, q62 sits ~1.2/255 mean off and q80 ~1.0/255 — the
// extra 60% in bytes buys nothing visible on this soft, gradient-heavy footage.
let AVIF_QUALITY = "62"

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: generate-film-frames.swift <source> <outDir>\n".data(using: .utf8)!)
    exit(2)
}
let sourcePath = args[1]
let outRoot = args[2]

let asset = AVURLAsset(url: URL(fileURLWithPath: sourcePath))
let duration = CMTimeGetSeconds(asset.duration)
guard let track = asset.tracks(withMediaType: .video).first else {
    FileHandle.standardError.write("no video track\n".data(using: .utf8)!)
    exit(1)
}
let natural = track.naturalSize
print("source \(Int(natural.width))x\(Int(natural.height)) \(duration)s -> \(FRAME_COUNT) frames")

let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

let fm = FileManager.default
let tmpDir = NSTemporaryDirectory() + "/libertymd-film-\(getpid())"
try fm.createDirectory(atPath: tmpDir, withIntermediateDirectories: true)
defer { try? fm.removeItem(atPath: tmpDir) }

for w in WIDTHS {
    try? fm.createDirectory(atPath: "\(outRoot)/\(w)", withIntermediateDirectories: true)
}

/// Crop the watermark strip, then resize to `width` preserving the cropped aspect.
func render(_ image: CGImage, width: Int) -> CGImage? {
    let cropRect = CGRect(
        x: 0,
        y: 0,
        width: CGFloat(image.width),
        height: (CGFloat(image.height) * (1.0 - CROP_BOTTOM)).rounded(.down)
    )
    guard let cropped = image.cropping(to: cropRect) else { return nil }
    let scale = Double(width) / Double(cropped.width)
    let outH = Int((Double(cropped.height) * scale).rounded())
    guard let ctx = CGContext(
        data: nil, width: width, height: outH, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else { return nil }
    ctx.interpolationQuality = .high
    ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: width, height: outH))
    return ctx.makeImage()
}

func writeJPEG(_ image: CGImage, to path: String, quality: Double) throws {
    let rep = NSBitmapImageRep(cgImage: image)
    guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: quality]) else {
        throw NSError(domain: "encode", code: 1)
    }
    try data.write(to: URL(fileURLWithPath: path))
}

func toAVIF(from jpegPath: String, to avifPath: String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
    p.arguments = ["-s", "format", "avif", "-s", "formatOptions", AVIF_QUALITY, jpegPath, "--out", avifPath]
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    try? p.run()
    p.waitUntilExit()
}

var totals: [Int: Int] = [:]
var firstFrame: CGImage?

for i in 0..<FRAME_COUNT {
    let t = duration * Double(i) / Double(FRAME_COUNT - 1)
    let time = CMTime(seconds: min(max(t, 0), duration - 0.02), preferredTimescale: 600)
    guard let full = try? generator.copyCGImage(at: time, actualTime: nil) else {
        FileHandle.standardError.write("frame \(i) failed\n".data(using: .utf8)!)
        continue
    }
    for w in WIDTHS {
        guard let img = render(full, width: w) else { continue }
        if i == 0 && w == WIDTHS[0] { firstFrame = img }
        let name = String(format: "f%03d", i)
        let jpeg = "\(tmpDir)/\(w)-\(name).jpg"
        let avif = "\(outRoot)/\(w)/\(name).avif"
        do {
            try writeJPEG(img, to: jpeg, quality: 0.95)
            toAVIF(from: jpeg, to: avif)
            let size = (try? fm.attributesOfItem(atPath: avif)[.size] as? Int) ?? 0
            totals[w, default: 0] += size ?? 0
        } catch {
            FileHandle.standardError.write("write \(w)/\(name): \(error)\n".data(using: .utf8)!)
        }
    }
}

// Poster doubles as the reduced-motion / no-AVIF fallback, so it stays a plain JPEG.
if let poster = firstFrame {
    try? writeJPEG(poster, to: "\(outRoot)/poster.jpg", quality: 0.82)
}

for w in WIDTHS {
    let kb = (totals[w] ?? 0) / 1024
    print("  \(w)px: \(FRAME_COUNT) frames, \(kb) KiB total")
}
if let attrs = try? fm.attributesOfItem(atPath: "\(outRoot)/poster.jpg"),
   let size = attrs[.size] as? Int {
    print("  poster.jpg: \(size / 1024) KiB")
}
