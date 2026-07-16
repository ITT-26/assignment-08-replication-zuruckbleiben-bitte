import type { CSSProperties } from "react"

import { SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { LayoutWorkspace } from "./components/layout-workspace"
import { SettingsSidebar } from "./components/settings/settings-sidebar"
import type { LayoutFormApi } from "./form/use-layout-form"
import { useLayoutForm } from "./form/use-layout-form"
import { useLayoutConfiguration } from "./hooks/use-layout-configuration"
import type { LayoutFormValues } from "./model/types"
import "./layout-generator.css"

interface LayoutGeneratorShellProps {
  form: LayoutFormApi
  values: LayoutFormValues
  valid: boolean
}

function LayoutGeneratorShell({ form, values, valid }: LayoutGeneratorShellProps) {
  const { configuration, error } = useLayoutConfiguration(values, valid)

  return (
    <SidebarProvider style={{ "--sidebar-width": "22rem" } as CSSProperties}>
      <SettingsSidebar form={form} configuration={configuration} />
      <LayoutWorkspace configuration={configuration} error={error} valid={valid} />
      <Toaster position="bottom-right" richColors />
    </SidebarProvider>
  )
}

export function LayoutGenerator() {
  const form = useLayoutForm()

  return (
    <form.Subscribe selector={(state) => [state.values, state.isValid] as const}>
      {([values, valid]) => <LayoutGeneratorShell form={form} values={values} valid={valid} />}
    </form.Subscribe>
  )
}
