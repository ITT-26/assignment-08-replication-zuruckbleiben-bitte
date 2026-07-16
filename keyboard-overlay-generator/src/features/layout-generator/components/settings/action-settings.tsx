import type { LayoutFormApi } from "../../form/use-layout-form"
import type { Side } from "../../model/types"
import { CheckboxField, SliderField } from "./form-fields"
import { SettingsSection } from "./settings-section"

function ActionFields({ form, side }: { form: LayoutFormApi; side: Side }) {
  return (
    <form.Subscribe selector={(state) => state.values.actions[side]}>
      {(action) => (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">{side === "left" ? "Linkes" : "Rechtes"} Trackpad</p>
          <CheckboxField form={form} name={`actions.${side}.space`} label="Leertaste" />
          <CheckboxField form={form} name={`actions.${side}.backspace`} label="Rücktaste" />
          {action.space && action.backspace && (
            <SliderField
              form={form}
              name={`actions.${side}.backspaceShare`}
              label="Rücktastenanteil"
              min={5}
              max={95}
              step={5}
            />
          )}
        </div>
      )}
    </form.Subscribe>
  )
}

export function ActionSettings({ form }: { form: LayoutFormApi }) {
  return (
    <SettingsSection title="Aktionsflächen">
      <ActionFields form={form} side="left" />
      <ActionFields form={form} side="right" />
    </SettingsSection>
  )
}
