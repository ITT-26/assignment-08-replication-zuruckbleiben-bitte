import type { DeviceId, LayoutConfiguration } from "../model/types"
import { getDeviceDetails } from "./configuration"
import { buildDeviceSvg } from "./svg"
import { numberInRange } from "./utils"

export function createPngBlob(deviceId: DeviceId, configuration: LayoutConfiguration): Promise<Blob> {
  const device = getDeviceDetails(deviceId, configuration)
  const svgBlob = new Blob([buildDeviceSvg(deviceId, configuration)], { type: "image/svg+xml;charset=utf-8" })
  const objectUrl = URL.createObjectURL(svgBlob)
  const pixelsPerMm = configuration.export.pixels_per_mm
  const pixelWidth = Math.round(device.widthMm * pixelsPerMm)
  const pixelHeight = Math.round(device.heightMm * pixelsPerMm)

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = pixelWidth
        canvas.height = pixelHeight
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Canvas-Kontext ist nicht verfügbar.")
        context.clearRect(0, 0, pixelWidth, pixelHeight)
        context.drawImage(image, 0, 0, pixelWidth, pixelHeight)
        canvas.toBlob(async (blob) => {
          URL.revokeObjectURL(objectUrl)
          if (!blob) {
            reject(new Error("PNG konnte nicht erzeugt werden."))
            return
          }
          try {
            resolve(await withPngPhysicalResolution(blob, pixelsPerMm))
          } catch (error) {
            reject(error)
          }
        }, "image/png")
      } catch (error) {
        URL.revokeObjectURL(objectUrl)
        reject(error)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("SVG konnte nicht für den PNG-Export geladen werden."))
    }
    image.src = objectUrl
  })
}

export async function withPngPhysicalResolution(blob: Blob, pixelsPerMm: number) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < signature.length || !signature.every((value, index) => bytes[index] === value)) {
    throw new Error("PNG-Signatur ist ungültig.")
  }

  const chunks: Uint8Array[] = [bytes.slice(0, 8)]
  const pixelsPerMetre = Math.round(numberInRange(pixelsPerMm, 0.001, 1000, 10) * 1000)
  const physicalData = new Uint8Array(9)
  const physicalView = new DataView(physicalData.buffer)
  physicalView.setUint32(0, pixelsPerMetre)
  physicalView.setUint32(4, pixelsPerMetre)
  physicalData[8] = 1
  const physicalChunk = makePngChunk("pHYs", physicalData)
  let inserted = false
  let offset = 8

  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0)
    const end = offset + length + 12
    if (end > bytes.length) throw new Error("PNG-Chunk ist unvollständig.")
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8))
    if (type === "IDAT" && !inserted) {
      chunks.push(physicalChunk)
      inserted = true
    }
    if (type !== "pHYs") chunks.push(bytes.slice(offset, end))
    offset = end
    if (type === "IEND") break
  }
  if (!inserted) throw new Error("PNG enthält keine Bilddaten.")

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(totalLength)
  let outputOffset = 0
  for (const chunk of chunks) {
    output.set(chunk, outputOffset)
    outputOffset += chunk.length
  }
  return new Blob([output], { type: "image/png" })
}

function makePngChunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type)
  const chunk = new Uint8Array(data.length + 12)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)
  view.setUint32(data.length + 8, pngCrc32(chunk.slice(4, data.length + 8)))
  return chunk
}

function pngCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
