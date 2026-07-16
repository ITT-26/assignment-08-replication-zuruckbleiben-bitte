import type { CSSProperties } from "react"

import { getDeviceDetails } from "../core/configuration"
import { buildDeviceSvg } from "../core/svg"
import type { DeviceId, LayoutConfiguration } from "../model/types"

interface PrintableLayoutsProps {
  configuration: LayoutConfiguration
  deviceIds: DeviceId[]
}

export function PrintableLayouts({ configuration, deviceIds }: PrintableLayoutsProps) {
  return (
    <section className="print-layouts" aria-label="Druckansicht der Tastaturhälften">
      {deviceIds.map((deviceId) => {
        const detail = getDeviceDetails(deviceId, configuration)
        const trackpadLabel = detail.side === "left" ? "Linkes Trackpad" : "Rechtes Trackpad"
        return (
          <article className="print-sheet" key={deviceId}>
            <header className="print-sheet-header">
              <div>
                <p className="print-sheet-kicker">{configuration.preset_name}</p>
                <h1>{trackpadLabel}</h1>
              </div>
              <p>{detail.widthMm} × {detail.heightMm} mm · Maßstab 1:1</p>
            </header>
            <div
              className="print-device-stage"
              style={{
                "--cut-corner-clearance": `${Math.max(3, configuration.style.panel_radius_mm + 3)}mm`,
              } as CSSProperties}
            >
              <div className="print-dimension print-dimension-width"><span>{detail.widthMm} mm</span></div>
              <div className="print-dimension print-dimension-height"><span>{detail.heightMm} mm</span></div>
              <div
                className="print-device-frame"
                style={{ width: `${detail.widthMm}mm`, height: `${detail.heightMm}mm` }}
                dangerouslySetInnerHTML={{ __html: buildDeviceSvg(deviceId, configuration) }}
              />
              {(["top", "right", "bottom", "left"] as const).map((edge) => (
                <span
                  aria-hidden="true"
                  className={`print-cut-guide print-cut-guide-${edge}`}
                  data-cut-edge={edge}
                  key={edge}
                />
              ))}
            </div>
            <footer className="print-sheet-footer">
              <span>Im Druckdialog „Tatsächliche Größe“ oder 100 % wählen.</span>
              <span className="print-ruler" aria-label="100 Millimeter Kontrollmaß">100 mm Kontrollmaß</span>
            </footer>
          </article>
        )
      })}
    </section>
  )
}
