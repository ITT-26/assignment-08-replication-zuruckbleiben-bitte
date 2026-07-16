import type { DeviceId, ExportFormat, LayoutConfiguration } from "../model/types"
import { getDeviceDetails } from "./configuration"
import { createPngBlob } from "./png"
import { buildDeviceSvg } from "./svg"
import { validateConfiguration } from "./validation"

export async function downloadDevice(
  deviceId: DeviceId,
  format: ExportFormat,
  configuration: LayoutConfiguration,
) {
  validateConfiguration(configuration)
  const side = getDeviceDetails(deviceId, configuration).side
  const filename = `${side}-trackpad.${format}`
  if (format === "svg") {
    downloadBlob(
      new Blob([buildDeviceSvg(deviceId, configuration)], { type: "image/svg+xml;charset=utf-8" }),
      filename,
    )
  } else {
    downloadBlob(await createPngBlob(deviceId, configuration), filename)
  }
  return filename
}

export async function downloadConfiguration(configuration: LayoutConfiguration) {
  validateConfiguration(configuration)
  const blob = new Blob([`${JSON.stringify(configuration, null, 2)}\n`], { type: "application/json;charset=utf-8" })
  downloadBlob(blob, "visual-twinpads-keyboard.json")
  return "visual-twinpads-keyboard.json"
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
