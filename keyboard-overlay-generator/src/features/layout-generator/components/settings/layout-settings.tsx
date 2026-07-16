import type { LayoutFormApi } from "../../form/use-layout-form"
import { SelectField, SliderField } from "./form-fields"
import { SettingsSection } from "./settings-section"

export function LayoutSettings({ form }: { form: LayoutFormApi }) {
  return (
    <SettingsSection title="Layout" defaultOpen>
      <SelectField
        form={form}
        name="presetId"
        label="Layout"
        options={[["alpha-de", "A–Z, reduziert"], ["iso-de", "ISO-DE-Hauptblock"]]}
      />
      <form.Subscribe selector={(state) => state.values.presetId}>
        {(presetId) => presetId === "iso-de" && (
          <>
            <SelectField
              form={form}
              name="labelProfile"
              label="Beschriftung"
              options={[["primary", "Nur Hauptzeichen"], ["macos", "Deutsch, macOS"], ["pc", "Deutsch, PC (AltGr)"]]}
            />
            <SliderField form={form} name="splitPercent" label="Aufteilung links/rechts" min={35} max={65} />
            <SliderField form={form} name="rowStaggerPercent" label="Zeilenversatz" min={0} max={150} step={5} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              0 % ohne zusätzlichen Versatz; 100 % folgt der Zeilenlage des ISO-DE-Hauptblocks.
            </p>
            <SelectField
              form={form}
              name="scalingMode"
              label="Tastengröße"
              options={[["common", "Einheitlicher Maßstab"], ["independent", "Je Gerät einpassen"]]}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Beim einheitlichen Maßstab sind die Tasten auf beiden Geräten gleich groß.
            </p>
            <SelectField
              form={form}
              name="maskAlignment"
              label="Ausrichtung"
              options={[["bottom", "Unterkante"], ["center", "Mitte"], ["top", "Oberkante"]]}
            />
            <form.Subscribe selector={(state) => state.values.maskAlignment}>
              {(alignment) => alignment !== "center" && (
                <SliderField form={form} name="maskMarginMm" label="Randabstand" min={4} max={24} step={1} suffix=" mm" />
              )}
            </form.Subscribe>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Der Randabstand gilt für die gewählte Kante auf beiden Geräten.
            </p>
          </>
        )}
      </form.Subscribe>
      <SelectField
        form={form}
        name="assignment"
        label="Gerätezuordnung"
        options={[["magic-right", "MacBook-Trackpad links"], ["magic-left", "Magic Trackpad links"]]}
      />
    </SettingsSection>
  )
}
