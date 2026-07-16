import { presetData } from "../model/presets"
import type {
  AlphaPreset,
  Assignment,
  DeviceDetails,
  DeviceId,
  DeviceRole,
  IsoPreset,
  IsoPresetKey,
  IsoSideMetrics,
  LabelProfile,
  LayoutConfiguration,
  LayoutDevice,
  LayoutFormValues,
  LayoutOptions,
  LayoutRegion,
  NormalizedBounds,
  NormalizedDevice,
  Side,
} from "../model/types"
import {
  calculateFitScale,
  calculateIsoSideMetrics,
  calculateMaskOriginY,
  getRowsWithAssignments,
  insetNormalizedBounds,
  insetRegionsForSpacing,
} from "./geometry"
import { numberInRange } from "./utils"
import { validateConfiguration } from "./validation"

const DEVICE_METADATA: Record<DeviceId, Omit<NormalizedDevice, "widthMm" | "heightMm">> = {
  magic: {
    id: "magic",
    role: "external",
    name: "Magic Trackpad",
    slug: "magic-trackpad",
    approximate: false,
  },
  macbook: {
    id: "macbook",
    role: "built-in",
    name: "MacBook Pro 16 Zoll (2019)",
    slug: "macbook-pro-2019",
    approximate: true,
  },
}

export function createLayoutConfiguration(values: LayoutFormValues) {
  const options = normalizeLayoutOptions(values)
  const configuration = options.presetId === "alpha-de"
    ? resolveAlphaConfiguration(options)
    : resolveIsoConfiguration(options)
  validateConfiguration(configuration)
  return configuration
}

function normalizeLayoutOptions(values: LayoutFormValues): LayoutOptions {
  return {
    ...values,
    splitPercent: numberInRange(values.splitPercent, 35, 65, 50),
    rowStaggerPercent: numberInRange(values.rowStaggerPercent, 0, 150, 100),
    maskMarginMm: numberInRange(values.maskMarginMm, 4, 24, 8),
    keyBlockInsetMm: numberInRange(values.keyBlockInsetMm, 1, 12, 5),
    panelRadiusMm: numberInRange(values.panelRadiusMm, 0, 30, 4),
    keyRadiusMm: numberInRange(values.keyRadiusMm, 0, 8, 1.5),
    keySpacingMm: numberInRange(values.keySpacingMm, 0.25, 3, 1),
    colors: { ...values.colors },
    opacity: {
      panel: numberInRange(values.opacity.panel, 0, 100, 0) / 100,
      key: numberInRange(values.opacity.key, 0, 100, 22) / 100,
    },
    actions: {
      left: normalizeAction(values, "left"),
      right: normalizeAction(values, "right"),
    },
    devices: {
      magic: normalizeDevice(values, "magic"),
      macbook: normalizeDevice(values, "macbook"),
    },
    pixelsPerMm: numberInRange(values.pixelsPerMm, 2, 30, 10),
  }
}

function normalizeAction(values: LayoutFormValues, side: Side) {
  return {
    space: values.actions[side].space,
    backspace: values.actions[side].backspace,
    backspaceShare: numberInRange(values.actions[side].backspaceShare, 5, 95, 30) / 100,
  }
}

function normalizeDevice(values: LayoutFormValues, deviceId: DeviceId): NormalizedDevice {
  const fallbackHeight = deviceId === "magic" ? 114.9 : 100
  return {
    ...DEVICE_METADATA[deviceId],
    widthMm: numberInRange(values.devices[deviceId].widthMm, 80, 300, 160),
    heightMm: numberInRange(values.devices[deviceId].heightMm, 60, 200, fallbackHeight),
  }
}

function resolveAlphaConfiguration(options: LayoutOptions) {
  const preset = presetData.presets["alpha-de"]
  const regions: LayoutRegion[] = []
  for (const side of ["left", "right"] as const) {
    const role = roleForSide(side, options.assignment)
    const device = role === "built-in" ? options.devices.macbook : options.devices.magic
    const geometryInset = Math.max(0, options.keyBlockInsetMm - options.keySpacingMm / 2)
    preset.sides[side].forEach((source) => {
      const bounds = insetNormalizedBounds(source, device, geometryInset)
      regions.push({
        ...source,
        ...bounds,
        side,
        role,
        secondary: "",
        tertiary: "",
      })
    })
    const actionSlot = insetNormalizedBounds(preset.action_slot, device, geometryInset)
    regions.push(...resolveActionSlot(actionSlot, side, role, true, options))
  }
  return baseConfiguration(preset, regions, options)
}

function resolveIsoConfiguration(options: LayoutOptions) {
  const preset = presetData.presets["iso-de"]
  const geometryInset = Math.max(0, options.keyBlockInsetMm - options.keySpacingMm / 2)
  const geometryMargin = Math.max(0, options.maskMarginMm - options.keySpacingMm / 2)
  const rowsWithAssignments = getRowsWithAssignments(preset, options.splitPercent)

  const sideMetrics: Record<Side, IsoSideMetrics> = {
    left: calculateIsoSideMetrics("left", preset, rowsWithAssignments, options.rowStaggerPercent),
    right: calculateIsoSideMetrics("right", preset, rowsWithAssignments, options.rowStaggerPercent),
  }
  const fitScaleByDevice: Record<DeviceId, number> = { magic: 0, macbook: 0 }
  for (const deviceId of ["magic", "macbook"] as const) {
    const device = options.devices[deviceId]
    fitScaleByDevice[deviceId] = calculateFitScale(
      device,
      sideMetrics[sideForDevice(deviceId, options.assignment)],
      geometryInset,
      options.maskAlignment,
      geometryMargin,
    )
  }
  const commonScale = Math.min(fitScaleByDevice.magic, fitScaleByDevice.macbook)
  const regions: LayoutRegion[] = []

  for (const deviceId of ["magic", "macbook"] as const) {
    const device = options.devices[deviceId]
    const side = sideForDevice(deviceId, options.assignment)
    const role = device.role
    const metrics = sideMetrics[side]
    const scale = options.scalingMode === "common" ? commonScale : fitScaleByDevice[deviceId]
    const layoutWidthMm = metrics.width * scale
    const layoutHeightMm = metrics.height * scale
    const originX = (device.widthMm - layoutWidthMm) / 2
    const originY = calculateMaskOriginY(device.heightMm, layoutHeightMm, options.maskAlignment, geometryMargin)

    metrics.rows.forEach((rowEntry, rowIndex) => {
      rowEntry.keys.forEach(({ key, x }) => {
        const keyX = originX + x * scale
        const keyY = originY + rowIndex * preset.geometry.key_height * scale
        const keyWidth = key.width * scale
        const keyHeight = preset.geometry.key_height * scale
        if (key.action_slot) {
          const slot: NormalizedBounds = {
            x0: keyX / device.widthMm,
            y0: keyY / device.heightMm,
            x1: (keyX + keyWidth) / device.widthMm,
            y1: (keyY + keyHeight) / device.heightMm,
          }
          regions.push(...resolveActionSlot(slot, side, role, false, options))
        } else {
          const [primary, secondary, tertiary] = labelsForKey(key, options.labelProfile)
          regions.push({
            id: key.id,
            label: primary,
            secondary,
            tertiary,
            output: key.action === "modifier" || key.action === "backspace" ? "" : primary,
            action: key.action || "insert",
            side,
            role,
            x0: keyX / device.widthMm,
            y0: keyY / device.heightMm,
            x1: (keyX + keyWidth) / device.widthMm,
            y1: (keyY + keyHeight) / device.heightMm,
          })
        }
      })
    })
  }

  return baseConfiguration(preset, regions, options)
}

function baseConfiguration(
  preset: AlphaPreset | IsoPreset,
  regions: LayoutRegion[],
  options: LayoutOptions,
): LayoutConfiguration {
  const assignment: Record<DeviceRole, Side> = {
    "built-in": sideForDevice("macbook", options.assignment),
    external: sideForDevice("magic", options.assignment),
  }
  const spacedRegions = insetRegionsForSpacing(regions, options)

  return {
    schema_version: 1,
    kind: "visual-twinpads-keyboard-layout",
    preset_id: options.presetId,
    preset_name: preset.name,
    label_profile: options.presetId === "iso-de" ? options.labelProfile : "alpha",
    scaling_mode: options.presetId === "iso-de" ? options.scalingMode : "normalized",
    row_stagger_percent: options.presetId === "iso-de" ? options.rowStaggerPercent : 0,
    mask_alignment: options.presetId === "iso-de" ? options.maskAlignment : "full-surface",
    mask_margin_mm: options.presetId === "iso-de" ? options.maskMarginMm : 0,
    key_block_inset_mm: options.keyBlockInsetMm,
    assignment,
    devices: {
      "built-in": exportDevice(options.devices.macbook, assignment["built-in"]),
      external: exportDevice(options.devices.magic, assignment.external),
    },
    regions: spacedRegions,
    style: {
      panel_radius_mm: options.panelRadiusMm,
      key_radius_mm: options.keyRadiusMm,
      key_spacing_mm: options.keySpacingMm,
      panel_color: options.colors.panel,
      key_color: options.colors.key,
      outline_color: options.colors.outline,
      text_color: options.colors.text,
      panel_opacity: options.opacity.panel,
      key_opacity: options.opacity.key,
    },
    export: { pixels_per_mm: options.pixelsPerMm },
  }
}

function exportDevice(device: NormalizedDevice, side: Side): LayoutDevice {
  return {
    device_id: device.id,
    name: device.name,
    side,
    width_mm: device.widthMm,
    height_mm: device.heightMm,
    approximate: device.approximate,
  }
}

export function labelsForKey(key: IsoPresetKey, profile: LabelProfile | "alpha") {
  if (profile === "primary") {
    const [primary] = key.labels.macos || key.labels.pc || [key.id]
    return [primary, "", ""] as const
  }
  const labels = profile === "macos" ? key.labels.macos : key.labels.pc
  return labels || [key.id, "", ""]
}

function resolveActionSlot(
  slot: NormalizedBounds,
  side: Side,
  role: DeviceRole,
  alphaMode: boolean,
  options: LayoutOptions,
) {
  const action = options.actions[side]
  const result: LayoutRegion[] = []
  const width = slot.x1 - slot.x0
  const spaceLabel = options.labelProfile === "macos" && !alphaMode ? "space" : "Leertaste"
  const backspaceLabel = options.labelProfile === "macos" && !alphaMode ? "⌫" : "Rück"

  if (action.space && action.backspace) {
    const split = slot.x1 - width * action.backspaceShare
    result.push(makeActionRegion(`space-${side}`, spaceLabel, "space", side, role, slot.x0, slot.y0, split, slot.y1))
    result.push(makeActionRegion(`backspace-${side}`, backspaceLabel, "backspace", side, role, split, slot.y0, slot.x1, slot.y1))
  } else if (action.space) {
    result.push(makeActionRegion(`space-${side}`, spaceLabel, "space", side, role, slot.x0, slot.y0, slot.x1, slot.y1))
  } else if (action.backspace) {
    result.push(makeActionRegion(`backspace-${side}`, backspaceLabel, "backspace", side, role, slot.x0, slot.y0, slot.x1, slot.y1))
  }
  return result
}

function makeActionRegion(
  id: string,
  label: string,
  action: "space" | "backspace",
  side: Side,
  role: DeviceRole,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): LayoutRegion {
  return {
    id,
    label,
    secondary: "",
    tertiary: "",
    output: action === "space" ? " " : "",
    action,
    side,
    role,
    x0,
    y0,
    x1,
    y1,
  }
}

export function sideForDevice(deviceId: DeviceId, assignment: Assignment): Side {
  if (assignment === "magic-left") return deviceId === "magic" ? "left" : "right"
  return deviceId === "magic" ? "right" : "left"
}

function roleForSide(side: Side, assignment: Assignment): DeviceRole {
  return sideForDevice("macbook", assignment) === side ? "built-in" : "external"
}

function roleForDevice(deviceId: DeviceId, configuration: LayoutConfiguration): DeviceRole {
  return configuration.devices["built-in"].device_id === deviceId ? "built-in" : "external"
}

export function buildSummary(configuration: LayoutConfiguration) {
  const leftRole: DeviceRole = configuration.assignment["built-in"] === "left" ? "built-in" : "external"
  const rightRole: DeviceRole = leftRole === "built-in" ? "external" : "built-in"
  const leftRegions = configuration.regions.filter((region) => region.role === leftRole).length
  const rightRegions = configuration.regions.filter((region) => region.role === rightRole).length
  return `${leftRegions} Tasten links · ${rightRegions} Tasten rechts`
}

export function getDeviceDetails(deviceId: DeviceId, configuration: LayoutConfiguration): DeviceDetails {
  const role = roleForDevice(deviceId, configuration)
  const device = configuration.devices[role]
  return {
    ...DEVICE_METADATA[deviceId],
    widthMm: device.width_mm,
    heightMm: device.height_mm,
    side: device.side,
    regionCount: configuration.regions.filter((region) => region.role === role).length,
    pixelWidth: Math.round(device.width_mm * configuration.export.pixels_per_mm),
    pixelHeight: Math.round(device.height_mm * configuration.export.pixels_per_mm),
  }
}
