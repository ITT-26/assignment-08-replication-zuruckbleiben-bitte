import type { ReactNode } from "react"
import { ChevronDownIcon } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FieldGroup } from "@/components/ui/field"
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar"

interface SettingsSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

export function SettingsSection({ title, children, defaultOpen = false }: SettingsSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent">
            {title}
            <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent className="px-2 pb-4 pt-2">
            <FieldGroup className="gap-5">{children}</FieldGroup>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
