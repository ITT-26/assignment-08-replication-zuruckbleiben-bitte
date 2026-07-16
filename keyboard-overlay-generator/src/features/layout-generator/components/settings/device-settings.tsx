import type { LayoutFormApi } from "../../form/use-layout-form"
import { NumberField } from "./form-fields"
import { SettingsSection } from "./settings-section"

export function DeviceSettings({ form }: { form: LayoutFormApi }) {
  return (
    <SettingsSection title="Gerätemaße">
      <p className="text-sm font-medium">Magic Trackpad</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField form={form} name="devices.magic.widthMm" label="Breite (mm)" min={80} max={300} step={0.1} />
        <NumberField form={form} name="devices.magic.heightMm" label="Höhe (mm)" min={60} max={200} step={0.1} />
      </div>
      <p className="text-sm font-medium">MacBook-Trackpad</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField form={form} name="devices.macbook.widthMm" label="Breite (mm)" min={80} max={300} step={0.1} />
        <NumberField form={form} name="devices.macbook.heightMm" label="Höhe (mm)" min={60} max={200} step={0.1} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Die Gerätezuordnung legt fest, welches Trackpad links beziehungsweise rechts verwendet wird.
      </p>
    </SettingsSection>
  )
}
