import type {
  DeviceRole,
  LayoutConfiguration,
  LayoutPresetData,
  LayoutRegion,
  Side,
} from "../model/types"

const VALID_ROLES = new Set<DeviceRole>(["built-in", "external"])
const VALID_SIDES = new Set<Side>(["left", "right"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function assertPresetData(data: unknown): asserts data is LayoutPresetData {
  if (!isRecord(data) || data.schema_version !== 1 || data.kind !== "visual-twinpads-layout-presets") {
    throw new Error("Unbekanntes Layout-Preset-Schema.")
  }
  if (!isRecord(data.presets) || !isRecord(data.presets["alpha-de"]) || !isRecord(data.presets["iso-de"])) {
    throw new Error("A–Z- oder ISO-DE-Preset fehlt.")
  }

  const alphaPreset = data.presets["alpha-de"]
  if (!isRecord(alphaPreset.sides) || !Array.isArray(alphaPreset.sides.left) || !Array.isArray(alphaPreset.sides.right)) {
    throw new Error("Das A–Z-Preset besitzt keine gültigen Seiten.")
  }
  const alphaRegions = [...alphaPreset.sides.left, ...alphaPreset.sides.right]
  const ids = alphaRegions.map((region) => isRecord(region) ? region.id : undefined)
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length || ids.length !== 26) {
    throw new Error("Das A–Z-Preset muss 26 eindeutige Buchstaben enthalten.")
  }
  if (ids.map((id) => String(id).toUpperCase()).sort().join("") !== "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    throw new Error("Das A–Z-Preset deckt nicht genau A bis Z ab.")
  }
}

export function validateConfiguration(configuration: LayoutConfiguration) {
  if (configuration.schema_version !== 1 || configuration.kind !== "visual-twinpads-keyboard-layout") {
    throw new Error("Unbekanntes Tastatur-Layout-Schema.")
  }
  if (!VALID_SIDES.has(configuration.assignment["built-in"]) || !VALID_SIDES.has(configuration.assignment.external)) {
    throw new Error("Ungültige Gerätezuordnung.")
  }
  if (configuration.assignment["built-in"] === configuration.assignment.external) {
    throw new Error("Beide Geräte dürfen nicht dieselbe Hälfte erhalten.")
  }
  if (Object.keys(configuration.devices).sort().join(",") !== "built-in,external") {
    throw new Error("Die Gerätekonfiguration muss built-in und external enthalten.")
  }

  for (const role of VALID_ROLES) {
    const device = configuration.devices[role]
    if (!device.device_id || device.side !== configuration.assignment[role]) {
      throw new Error(`Gerätedaten und Seitenzuordnung stimmen für ${role} nicht überein.`)
    }
    if (!Number.isFinite(device.width_mm) || device.width_mm <= 0 || !Number.isFinite(device.height_mm) || device.height_mm <= 0) {
      throw new Error(`Ungültige Gerätemaße für ${role}.`)
    }
  }

  const ids = new Set<string>()
  for (const region of configuration.regions) {
    if (!region.id || ids.has(region.id)) throw new Error(`Doppelte oder leere Tasten-ID: ${region.id || "(leer)"}`)
    ids.add(region.id)
    if (!VALID_ROLES.has(region.role) || !VALID_SIDES.has(region.side)) {
      throw new Error(`Ungültige Rolle oder Seite für ${region.id}.`)
    }
    if (configuration.assignment[region.role] !== region.side) {
      throw new Error(`Region ${region.id} liegt auf der falschen Seite für ${region.role}.`)
    }
    for (const value of [region.x0, region.y0, region.x1, region.y1]) {
      if (!Number.isFinite(value) || value < -1e-9 || value > 1 + 1e-9) {
        throw new Error(`Koordinate außerhalb 0…1 für ${region.id}.`)
      }
    }
    if (region.x1 <= region.x0 || region.y1 <= region.y0) {
      throw new Error(`Leere Tastenregion für ${region.id}.`)
    }
  }

  for (const role of VALID_ROLES) {
    const roleRegions = configuration.regions.filter((region) => region.role === role)
    for (let index = 0; index < roleRegions.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < roleRegions.length; otherIndex += 1) {
        if (regionsOverlap(roleRegions[index], roleRegions[otherIndex])) {
          throw new Error(`Überlappende Regionen: ${roleRegions[index].id} und ${roleRegions[otherIndex].id}.`)
        }
      }
    }
  }
  return true
}

function regionsOverlap(left: LayoutRegion, right: LayoutRegion) {
  const epsilon = 1e-8
  return Math.min(left.x1, right.x1) - Math.max(left.x0, right.x0) > epsilon
    && Math.min(left.y1, right.y1) - Math.max(left.y0, right.y0) > epsilon
}
