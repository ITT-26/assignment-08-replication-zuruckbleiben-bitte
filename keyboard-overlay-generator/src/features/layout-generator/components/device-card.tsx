import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { getDeviceDetails } from "../core/configuration"
import { downloadDevice } from "../core/download"
import { buildDeviceSvg } from "../core/svg"
import type { DeviceId, ExportFormat, LayoutConfiguration } from "../model/types"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

interface DeviceCardProps {
  deviceId: DeviceId
  configuration: LayoutConfiguration
}

export function DeviceCard({ deviceId, configuration }: DeviceCardProps) {
  const detail = getDeviceDetails(deviceId, configuration)
  const trackpadLabel = detail.side === "left" ? "Linkes Trackpad" : "Rechtes Trackpad"
  const runExport = (format: ExportFormat) => toast.promise(downloadDevice(deviceId, format, configuration), {
    loading: `${format.toUpperCase()} wird erstellt …`,
    success: (filename) => `${filename} heruntergeladen`,
    error: (error: unknown) => `Export fehlgeschlagen: ${errorMessage(error)}`,
  })

  return (
    <Card className="gap-4 py-5">
      <CardHeader>
        <div>
          <CardTitle>{trackpadLabel}</CardTitle>
          <CardDescription>
            {detail.widthMm} × {detail.heightMm} mm · {detail.pixelWidth} × {detail.pixelHeight} px
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div
          className="checkerboard grid min-h-56 place-items-center overflow-hidden rounded-lg border p-3"
          dangerouslySetInnerHTML={{ __html: buildDeviceSvg(deviceId, configuration) }}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          {detail.regionCount} Tasten
        </p>
      </CardContent>
      <CardFooter className="justify-end gap-2 pt-1">
        <Button variant="outline" type="button" onClick={() => runExport("svg")}>SVG</Button>
        <Button type="button" onClick={() => runExport("png")}>PNG</Button>
      </CardFooter>
    </Card>
  )
}
