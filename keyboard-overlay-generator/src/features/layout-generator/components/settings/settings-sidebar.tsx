import { DownloadIcon, PrinterIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { downloadConfiguration } from "../../core/download"
import type { LayoutFormApi } from "../../form/use-layout-form"
import type { LayoutConfiguration } from "../../model/types"
import { ActionSettings } from "./action-settings"
import { AppearanceSettings } from "./appearance-settings"
import { DeviceSettings } from "./device-settings"
import { NumberField } from "./form-fields"
import { LayoutSettings } from "./layout-settings"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

interface SettingsSidebarProps {
  form: LayoutFormApi
  configuration: LayoutConfiguration | null
}

export function SettingsSidebar({ form, configuration }: SettingsSidebarProps) {
  const exportConfiguration = () => {
    if (!configuration) return
    toast.promise(downloadConfiguration(configuration), {
      loading: "JSON wird erstellt …",
      success: "Konfiguration heruntergeladen",
      error: (error: unknown) => `Export fehlgeschlagen: ${errorMessage(error)}`,
    })
  }

  return (
    <Sidebar collapsible="offcanvas" className="border-r">
      <SidebarHeader className="h-14 justify-center border-b px-4 py-0">
        <span className="font-semibold">Tastenaufteilung</span>
      </SidebarHeader>
      <SidebarContent className="overflow-hidden p-0">
        <ScrollArea className="h-full" type="auto">
          <div className="w-full min-w-0 pb-3 pr-3">
            <LayoutSettings form={form} />
            <Separator />
            <ActionSettings form={form} />
            <Separator />
            <DeviceSettings form={form} />
            <Separator />
            <AppearanceSettings form={form} />
          </div>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <NumberField form={form} name="pixelsPerMm" label="PNG-Auflösung (Pixel/mm)" min={2} max={30} />
        <Button variant="outline" type="button" onClick={() => window.print()} aria-label="Beide Tastaturhälften drucken">
          <PrinterIcon />Drucken / PDF
        </Button>
        <Button type="button" onClick={exportConfiguration} disabled={!configuration}>
          <DownloadIcon />Konfiguration (JSON)
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
