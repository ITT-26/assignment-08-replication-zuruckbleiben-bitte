import type { LayoutFormApi } from "../../form/use-layout-form"
import { ColorField, SliderField } from "./form-fields"
import { SettingsSection } from "./settings-section"

export function AppearanceSettings({ form }: { form: LayoutFormApi }) {
  return (
    <SettingsSection title="Darstellung">
      <SliderField form={form} name="panelRadiusMm" label="Trackpad-Radius" min={0} max={30} step={0.5} suffix=" mm" />
      <SliderField form={form} name="keyRadiusMm" label="Tasten-Radius" min={0} max={8} step={0.25} suffix=" mm" />
      <SliderField form={form} name="keySpacingMm" label="Tastenfuge" min={0.25} max={3} step={0.25} suffix=" mm" />
      <SliderField form={form} name="keyBlockInsetMm" label="Tastenblock-Rand" min={1} max={12} step={0.5} suffix=" mm" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Voreinstellung: 1 mm Tastenfuge und 5 mm Abstand zum Trackpadrand.
      </p>
      <ColorField form={form} name="colors.panel" label="Trackpadfläche" />
      <ColorField form={form} name="colors.key" label="Tastenfläche" />
      <ColorField form={form} name="colors.outline" label="Konturen" />
      <ColorField form={form} name="colors.text" label="Beschriftung" />
      <SliderField form={form} name="opacity.panel" label="Trackpad-Deckkraft" min={0} max={100} />
      <SliderField form={form} name="opacity.key" label="Tasten-Deckkraft" min={0} max={100} />
    </SettingsSection>
  )
}
