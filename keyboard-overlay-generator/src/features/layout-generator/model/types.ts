export type DeviceId = "magic" | "macbook"
export type DeviceRole = "built-in" | "external"
export type Side = "left" | "right"
export type PresetId = "alpha-de" | "iso-de"
export type LabelProfile = "pc" | "macos" | "primary"
export type Assignment = "magic-left" | "magic-right"
export type ScalingMode = "common" | "independent"
export type MaskAlignment = "bottom" | "center" | "top"
export type ExportFormat = "svg" | "png"

export interface LayoutFormValues {
  presetId: PresetId
  labelProfile: LabelProfile
  splitPercent: number
  assignment: Assignment
  scalingMode: ScalingMode
  rowStaggerPercent: number
  maskAlignment: MaskAlignment
  maskMarginMm: number
  keyBlockInsetMm: number
  actions: Record<Side, {
    space: boolean
    backspace: boolean
    backspaceShare: number
  }>
  devices: Record<DeviceId, {
    widthMm: number
    heightMm: number
  }>
  panelRadiusMm: number
  keyRadiusMm: number
  keySpacingMm: number
  colors: {
    panel: string
    key: string
    outline: string
    text: string
  }
  opacity: {
    panel: number
    key: number
  }
  pixelsPerMm: number
}

export interface NormalizedDevice {
  id: DeviceId
  role: DeviceRole
  name: string
  slug: string
  widthMm: number
  heightMm: number
  approximate: boolean
}

export interface LayoutOptions extends Omit<LayoutFormValues, "actions" | "devices" | "opacity"> {
  actions: Record<Side, {
    space: boolean
    backspace: boolean
    backspaceShare: number
  }>
  devices: Record<DeviceId, NormalizedDevice>
  opacity: {
    panel: number
    key: number
  }
}

export interface NormalizedBounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type KeyAction = "insert" | "modifier" | "backspace" | "space"

export interface LayoutRegion extends NormalizedBounds {
  id: string
  label: string
  secondary: string
  tertiary: string
  output: string
  action: KeyAction
  side: Side
  role: DeviceRole
}

export interface LayoutDevice {
  device_id: DeviceId
  name: string
  side: Side
  width_mm: number
  height_mm: number
  approximate: boolean
}

export interface LayoutConfiguration {
  schema_version: 1
  kind: "visual-twinpads-keyboard-layout"
  preset_id: PresetId
  preset_name: string
  label_profile: LabelProfile | "alpha"
  scaling_mode: ScalingMode | "normalized"
  row_stagger_percent: number
  mask_alignment: MaskAlignment | "full-surface"
  mask_margin_mm: number
  key_block_inset_mm: number
  assignment: Record<DeviceRole, Side>
  devices: Record<DeviceRole, LayoutDevice>
  regions: LayoutRegion[]
  style: {
    panel_radius_mm: number
    key_radius_mm: number
    key_spacing_mm: number
    panel_color: string
    key_color: string
    outline_color: string
    text_color: string
    panel_opacity: number
    key_opacity: number
  }
  export: {
    pixels_per_mm: number
  }
}

export interface DeviceDetails extends NormalizedDevice {
  side: Side
  regionCount: number
  pixelWidth: number
  pixelHeight: number
}

export interface PresetLabelSet {
  pc: [string, string, string]
  macos: [string, string, string]
}

export interface IsoPresetKey {
  id: string
  width: number
  labels: PresetLabelSet
  fixed_side?: Side
  action?: Exclude<KeyAction, "space">
  action_slot?: boolean
}

export interface IsoPresetRow {
  id: string
  keys: IsoPresetKey[]
}

export interface IsoPreset {
  name: string
  geometry: {
    key_height: number
    key_gap: number
    row_gap: number
    padding_mm: number
  }
  rows: IsoPresetRow[]
}

export interface AlphaPresetRegion extends NormalizedBounds {
  id: string
  label: string
  output: string
  action: "insert"
}

export interface AlphaPreset {
  name: string
  action_slot: NormalizedBounds
  sides: Record<Side, AlphaPresetRegion[]>
}

export interface LayoutPresetData {
  schema_version: 1
  kind: "visual-twinpads-layout-presets"
  default_preset: PresetId
  default_label_profile: Exclude<LabelProfile, "primary">
  default_assignment: Record<DeviceRole, Side>
  defaults: Record<string, unknown>
  presets: {
    "alpha-de": AlphaPreset
    "iso-de": IsoPreset
  }
}

export interface PositionedIsoKey {
  key: IsoPresetKey
  x: number
}

export interface PositionedIsoRow {
  id: string
  keys: PositionedIsoKey[]
}

export interface IsoSideMetrics {
  side: Side
  rows: PositionedIsoRow[]
  width: number
  height: number
}
