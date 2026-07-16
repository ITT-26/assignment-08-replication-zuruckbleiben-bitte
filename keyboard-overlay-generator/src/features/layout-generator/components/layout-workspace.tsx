import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { buildSummary, getDeviceDetails } from "../core/configuration"
import { buildOverviewSvg } from "../core/svg"
import type { DeviceId, LayoutConfiguration } from "../model/types"
import { DeviceCard } from "./device-card"
import { PrintableLayouts } from "./printable-layouts"

interface LayoutWorkspaceProps {
  configuration: LayoutConfiguration | null
  error: string
  valid: boolean
}

export function LayoutWorkspace({ configuration, error, valid }: LayoutWorkspaceProps) {
  const orderedDevices = React.useMemo(() => {
    if (!configuration) return []
    return (["magic", "macbook"] as DeviceId[]).sort((left, right) => {
      const leftSide = getDeviceDetails(left, configuration).side
      const rightSide = getDeviceDetails(right, configuration).side
      if (leftSide === rightSide) return 0
      return leftSide === "left" ? -1 : 1
    })
  }, [configuration])

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden">
      <header className="z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
        <SidebarTrigger className="md:hidden" />
        <Separator orientation="vertical" className="h-5 md:hidden" />
        <span className="text-sm font-medium">Geometrie und Export</span>
        {!valid && <Badge variant="destructive" className="ml-auto">Eingaben prüfen</Badge>}
      </header>
      <ScrollArea className="min-h-0 flex-1" type="auto">
        <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6 lg:p-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Tastatur auf zwei Trackpads</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Aufteilung einstellen und als SVG, PNG oder JSON ausgeben.
            </p>
          </div>
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
            </Card>
          )}
          {configuration ? (
            <>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Gesamtansicht</CardTitle>
                    <CardDescription>{buildSummary(configuration)}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div
                    className="overflow-hidden rounded-lg border bg-muted/20 p-3"
                    dangerouslySetInnerHTML={{ __html: buildOverviewSvg(configuration) }}
                  />
                </CardContent>
              </Card>
              <div className="grid items-stretch gap-4 lg:grid-cols-2">
                {orderedDevices.map((deviceId) => (
                  <DeviceCard key={deviceId} deviceId={deviceId} configuration={configuration} />
                ))}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Vorschau wird vorbereitet …
              </CardContent>
            </Card>
          )}
        </main>
      </ScrollArea>
      {configuration && <PrintableLayouts configuration={configuration} deviceIds={orderedDevices} />}
    </SidebarInset>
  )
}
