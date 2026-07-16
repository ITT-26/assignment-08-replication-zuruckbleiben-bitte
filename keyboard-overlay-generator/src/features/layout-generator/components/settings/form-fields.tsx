import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import type { LayoutFormApi } from "../../form/use-layout-form"
import type { LayoutFormValues, Side } from "../../model/types"

type SelectFieldName = "presetId" | "labelProfile" | "assignment" | "scalingMode" | "maskAlignment"
type SelectFieldValue = LayoutFormValues[SelectFieldName]
type NumberFieldName =
  | "devices.magic.widthMm"
  | "devices.magic.heightMm"
  | "devices.macbook.widthMm"
  | "devices.macbook.heightMm"
  | "pixelsPerMm"
type SliderFieldName =
  | "splitPercent"
  | "rowStaggerPercent"
  | "maskMarginMm"
  | "panelRadiusMm"
  | "keyRadiusMm"
  | "keySpacingMm"
  | "keyBlockInsetMm"
  | "opacity.panel"
  | "opacity.key"
  | `actions.${Side}.backspaceShare`
type CheckboxFieldName = `actions.${Side}.${"space" | "backspace"}`
type ColorFieldName = `colors.${"panel" | "key" | "outline" | "text"}`

interface SelectFieldProps {
  form: LayoutFormApi
  name: SelectFieldName
  label: string
  options: ReadonlyArray<readonly [SelectFieldValue, string]>
}

export function SelectField({ form, name, label, options }: SelectFieldProps) {
  return (
    <form.Field name={name}>
      {(field) => {
        const invalid = field.state.meta.isTouched && !field.state.meta.isValid
        return (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <Select
              value={field.state.value}
              onValueChange={(value) => field.handleChange(value as typeof field.state.value)}
            >
              <SelectTrigger id={name} aria-invalid={invalid}><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}
              </SelectContent>
            </Select>
            {invalid && <FieldError errors={field.state.meta.errors} />}
          </Field>
        )
      }}
    </form.Field>
  )
}

interface NumberFieldProps {
  form: LayoutFormApi
  name: NumberFieldName
  label: string
  min: number
  max: number
  step?: number
}

export function NumberField({ form, name, label, min, max, step = 1 }: NumberFieldProps) {
  return (
    <form.Field name={name}>
      {(field) => {
        const invalid = field.state.meta.isTouched && !field.state.meta.isValid
        return (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <Input
              id={name}
              name={name}
              type="number"
              min={min}
              max={max}
              step={step}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.valueAsNumber)}
              aria-invalid={invalid}
            />
            {invalid && <FieldError errors={field.state.meta.errors} />}
          </Field>
        )
      }}
    </form.Field>
  )
}

interface SliderFieldProps {
  form: LayoutFormApi
  name: SliderFieldName
  label: string
  min: number
  max: number
  step?: number
  suffix?: string
}

export function SliderField({ form, name, label, min, max, step = 1, suffix = "%" }: SliderFieldProps) {
  return (
    <form.Field name={name}>
      {(field) => {
        const invalid = field.state.meta.isTouched && !field.state.meta.isValid
        return (
          <Field data-invalid={invalid}>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel id={`${name}-label`} htmlFor={name}>{label}</FieldLabel>
              <output htmlFor={name} className="text-xs tabular-nums text-muted-foreground">
                {field.state.value}{suffix}
              </output>
            </div>
            <Slider
              id={name}
              min={min}
              max={max}
              step={step}
              value={[Number(field.state.value)]}
              onValueChange={([value]) => field.handleChange(value)}
              aria-label={label}
              aria-invalid={invalid}
            />
            {invalid && <FieldError errors={field.state.meta.errors} />}
          </Field>
        )
      }}
    </form.Field>
  )
}

interface CheckboxFieldProps {
  form: LayoutFormApi
  name: CheckboxFieldName
  label: string
}

export function CheckboxField({ form, name, label }: CheckboxFieldProps) {
  return (
    <form.Field name={name}>
      {(field) => {
        const invalid = field.state.meta.isTouched && !field.state.meta.isValid
        return (
          <Field orientation="horizontal" data-invalid={invalid}>
            <Checkbox
              id={name}
              checked={Boolean(field.state.value)}
              onCheckedChange={(value) => field.handleChange(value === true)}
              aria-invalid={invalid}
            />
            <FieldLabel htmlFor={name} className="font-normal">{label}</FieldLabel>
          </Field>
        )
      }}
    </form.Field>
  )
}

interface ColorFieldProps {
  form: LayoutFormApi
  name: ColorFieldName
  label: string
}

export function ColorField({ form, name, label }: ColorFieldProps) {
  return (
    <form.Field name={name}>
      {(field) => (
        <Field orientation="horizontal">
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Input
            id={name}
            type="color"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            className="h-9 w-14 p-1"
          />
        </Field>
      )}
    </form.Field>
  )
}
