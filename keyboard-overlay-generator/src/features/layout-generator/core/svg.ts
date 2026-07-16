import { getDeviceDetails } from "./configuration"
import { presetData } from "../model/presets"
import type {
  DeviceId,
  LayoutConfiguration,
  LayoutRegion,
  Side,
} from "../model/types"
import { clamp, escapeXml, formatNumber } from "./utils"

const SVG_NS = "http://www.w3.org/2000/svg"

type RenderableRegion = Pick<LayoutRegion, "id" | "label" | "secondary" | "tertiary" | "role" | "side">

export function buildDeviceSvg(deviceId: DeviceId, configuration: LayoutConfiguration) {
  const device = getDeviceDetails(deviceId, configuration)
  const regions = configuration.regions.filter((region) => region.role === device.role)
  const style = configuration.style
  const panelRadius = clamp(style.panel_radius_mm, 0, Math.min(device.widthMm, device.heightMm) / 2)
  const strokeWidth = clamp(Math.min(device.widthMm, device.heightMm) * 0.004, 0.35, 0.7)
  const panelX = strokeWidth / 2
  const panelY = strokeWidth / 2
  const panelWidth = device.widthMm - strokeWidth
  const panelHeight = device.heightMm - strokeWidth
  const clipId = `${deviceId}-panel-clip`
  const regionMarkup = regions.map((region) => buildRegionMarkup(
    region,
    region.x0 * device.widthMm,
    region.y0 * device.heightMm,
    (region.x1 - region.x0) * device.widthMm,
    (region.y1 - region.y0) * device.heightMm,
    false,
    configuration,
  )).join("")
  const sideLabel = device.side === "left" ? "linkes" : "rechtes"
  const metadata = escapeXml(JSON.stringify({
    preset_id: configuration.preset_id,
    role: device.role,
    side: device.side,
    device_id: device.id,
  }))

  return [
    `<svg xmlns="${SVG_NS}" class="trackpad-svg" width="${formatNumber(device.widthMm)}mm" height="${formatNumber(device.heightMm)}mm" viewBox="0 0 ${formatNumber(device.widthMm)} ${formatNumber(device.heightMm)}" role="img" aria-labelledby="${deviceId}-svg-title ${deviceId}-svg-desc" preserveAspectRatio="xMidYMid meet">`,
    `<title id="${deviceId}-svg-title">${sideLabel[0].toUpperCase() + sideLabel.slice(1)} Trackpad</title>`,
    `<desc id="${deviceId}-svg-desc">${escapeXml(configuration.preset_name)}, ${sideLabel} Trackpad, ${regions.length} aktive Regionen.</desc>`,
    `<metadata>${metadata}</metadata>`,
    `<defs><clipPath id="${clipId}"><rect x="${formatNumber(panelX + strokeWidth / 2)}" y="${formatNumber(panelY + strokeWidth / 2)}" width="${formatNumber(panelWidth - strokeWidth)}" height="${formatNumber(panelHeight - strokeWidth)}" rx="${formatNumber(Math.max(0, panelRadius - strokeWidth / 2))}"/></clipPath></defs>`,
    `<rect data-trackpad="true" x="${formatNumber(panelX)}" y="${formatNumber(panelY)}" width="${formatNumber(panelWidth)}" height="${formatNumber(panelHeight)}" rx="${formatNumber(panelRadius)}" fill="${style.panel_color}" fill-opacity="${formatNumber(style.panel_opacity)}"/>`,
    `<g clip-path="url(#${clipId})">${regionMarkup}</g>`,
    `<rect data-trackpad-outline="true" x="${formatNumber(panelX)}" y="${formatNumber(panelY)}" width="${formatNumber(panelWidth)}" height="${formatNumber(panelHeight)}" rx="${formatNumber(panelRadius)}" fill="none" stroke="${style.outline_color}" stroke-opacity="0.55" stroke-width="${formatNumber(strokeWidth)}" vector-effect="non-scaling-stroke" pointer-events="none"/>`,
    "</svg>",
  ].join("")
}

function buildRegionMarkup(
  region: RenderableRegion,
  x: number,
  y: number,
  width: number,
  height: number,
  overview: boolean,
  configuration: LayoutConfiguration,
  visualInsetX = 0,
  visualInsetY = 0,
) {
  const style = configuration.style
  const insetX = Math.min(Math.max(0, visualInsetX), width / 4)
  const insetY = Math.min(Math.max(0, visualInsetY), height / 4)
  const visibleX = x + insetX
  const visibleY = y + insetY
  const visibleWidth = width - insetX * 2
  const visibleHeight = height - insetY * 2
  const radius = overview ? Math.min(visibleWidth, visibleHeight) * 0.1 : Math.min(style.key_radius_mm, visibleWidth / 2, visibleHeight / 2)
  const outline = overview ? "currentColor" : style.outline_color
  const keyFill = overview ? "currentColor" : style.key_color
  const textColor = overview ? "currentColor" : style.text_color
  const fillOpacity = overview ? 0.12 : style.key_opacity
  const strokeWidth = overview ? Math.max(0.8, height * 0.018) : clamp(Math.min(width, height) * 0.025, 0.25, 0.55)
  const primarySize = overview ? Math.max(7, Math.min(height * 0.3, width * 0.28)) : Math.max(Math.min(height * 0.3, width * 0.28), 1.7)
  const smallSize = overview ? Math.max(5, height * 0.16) : Math.max(height * 0.15, 1.2)
  const isWord = region.label.length > 2
  const wordSize = Math.max(Math.min(primarySize * 0.62, width * 0.18), overview ? 5 : 1.2)
  const textParts: string[] = []

  if (region.secondary) {
    textParts.push(`<text x="${formatNumber(x + width * 0.18)}" y="${formatNumber(y + height * 0.25)}" fill="${textColor}" font-family="Arial,Helvetica,sans-serif" font-size="${formatNumber(smallSize)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(region.secondary)}</text>`)
  }
  if (region.tertiary) {
    textParts.push(`<text x="${formatNumber(x + width * 0.8)}" y="${formatNumber(y + height * 0.25)}" fill="${textColor}" font-family="Arial,Helvetica,sans-serif" font-size="${formatNumber(smallSize)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(region.tertiary)}</text>`)
  }
  textParts.push(`<text x="${formatNumber(x + width / 2)}" y="${formatNumber(y + height * (region.secondary || region.tertiary ? 0.64 : 0.52))}" fill="${textColor}" font-family="Arial,Helvetica,sans-serif" font-size="${formatNumber(isWord ? wordSize : primarySize)}" font-weight="${isWord ? "400" : "500"}" text-anchor="middle" dominant-baseline="middle">${escapeXml(region.label)}</text>`)

  return [
    `<g data-key="${escapeXml(region.id)}" data-role="${escapeXml(region.role)}" data-side="${escapeXml(region.side)}">`,
    `<rect data-region="${escapeXml(region.id)}" x="${formatNumber(visibleX)}" y="${formatNumber(visibleY)}" width="${formatNumber(visibleWidth)}" height="${formatNumber(visibleHeight)}" rx="${formatNumber(radius)}" fill="${keyFill}" fill-opacity="${formatNumber(fillOpacity)}" stroke="${outline}" stroke-width="${formatNumber(strokeWidth)}"/>`,
    ...textParts,
    "</g>",
  ].join("")
}

export function buildOverviewSvg(configuration: LayoutConfiguration) {
  if (configuration.preset_id === "alpha-de") return buildAlphaOverviewSvg(configuration)
  return buildIsoOverviewSvg(configuration)
}

function buildAlphaOverviewSvg(configuration: LayoutConfiguration) {
  const panelWidth = 210
  const panelHeight = 185
  const panelY = 24
  const panelStroke = 1.4
  const positions: Record<Side, number> = { left: 10, right: 240 }
  const markup = (["left", "right"] as const).map((side) => {
    const color = side === "left" ? "var(--left)" : "var(--right)"
    const regions = configuration.regions.filter((region) => region.side === side)
    const clipId = `alpha-${side}-panel-clip`
    return [
      `<g style="color:${color}">`,
      `<text x="${positions[side] + panelWidth / 2}" y="15" fill="currentColor" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="500" text-anchor="middle">${side === "left" ? "Linkes" : "Rechtes"} Trackpad</text>`,
      `<defs><clipPath id="${clipId}"><rect x="${positions[side] + panelStroke / 2}" y="${panelY + panelStroke / 2}" width="${panelWidth - panelStroke}" height="${panelHeight - panelStroke}" rx="${10 - panelStroke / 2}"/></clipPath></defs>`,
      `<g clip-path="url(#${clipId})">`,
      regions.map((region) => buildRegionMarkup(
        region,
        positions[side] + region.x0 * panelWidth,
        panelY + region.y0 * panelHeight,
        (region.x1 - region.x0) * panelWidth,
        (region.y1 - region.y0) * panelHeight,
        true,
        configuration,
      )).join(""),
      "</g>",
      `<rect data-trackpad-outline="true" x="${positions[side]}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="10" fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="${panelStroke}" pointer-events="none"/>`,
      "</g>",
    ].join("")
  }).join("")
  return [
    `<svg xmlns="${SVG_NS}" class="overview-svg" viewBox="0 0 460 219" role="img" aria-labelledby="overview-title overview-desc">`,
    '<title id="overview-title">Reduziertes A–Z-QWERTZ-Layout auf zwei Trackpads</title>',
    '<desc id="overview-desc">Die linke und rechte Handhälfte werden als normierte Trefferregionen auf den zugeordneten Trackpads dargestellt.</desc>',
    markup,
    "</svg>",
  ].join("")
}

function buildIsoOverviewSvg(configuration: LayoutConfiguration) {
  const preset = presetData.presets["iso-de"]
  const unit = 56
  const visualInset = Math.max(0.5, configuration.style.key_spacing_mm * 1.5)
  const padding = 18
  const rowWidths = preset.rows.map((row) => row.keys.reduce((sum, key) => sum + key.width * unit, 0))
  const maxWidth = Math.max(...rowWidths)
  const width = maxWidth + padding * 2
  const height = preset.rows.length * unit + padding * 2
  const regionById = new Map(configuration.regions.map((region) => [region.id, region]))

  const rows = preset.rows.map((row, rowIndex) => {
    let cursor = padding + (maxWidth - rowWidths[rowIndex]) / 2 * configuration.row_stagger_percent / 100
    return row.keys.map((key) => {
      const keyWidth = key.width * unit
      const configuredRegion = regionById.get(key.id)
      const side = key.fixed_side || configuredRegion?.side
      if (!side) throw new Error(`Keine Trackpad-Seite für ${key.id} gefunden.`)
      const x = cursor
      const y = padding + rowIndex * unit
      cursor += keyWidth
      const color = side === "left" ? "var(--left)" : "var(--right)"
      if (key.action_slot) {
        const actionRegions = [regionById.get(`space-${side}`), regionById.get(`backspace-${side}`)]
          .filter((region): region is LayoutRegion => Boolean(region))
        if (!actionRegions.length) {
          return `<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(keyWidth)}" height="${unit}" rx="6" fill="none" stroke="${color}" stroke-opacity="0.35"/>`
        }
        let slotCursor = x
        const totalRatio = actionRegions.reduce((sum, region) => sum + region.x1 - region.x0, 0)
        return actionRegions.map((region) => {
          const ratio = (region.x1 - region.x0) / totalRatio
          const segmentWidth = keyWidth * ratio
          const result = `<g style="color:${color}">${buildRegionMarkup(region, slotCursor, y, segmentWidth, unit, true, configuration, visualInset, visualInset)}</g>`
          slotCursor += segmentWidth
          return result
        }).join("")
      }
      if (!configuredRegion) throw new Error(`Keine Layoutregion für ${key.id} gefunden.`)
      return `<g style="color:${color}">${buildRegionMarkup(configuredRegion, x, y, keyWidth, unit, true, configuration, visualInset, visualInset)}</g>`
    }).join("")
  }).join("")
  return [
    `<svg xmlns="${SVG_NS}" class="overview-svg" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}" role="img" aria-labelledby="overview-title overview-desc">`,
    '<title id="overview-title">Deutscher ISO-Hauptblock mit eingerasteter Aufteilung</title>',
    '<desc id="overview-desc">Blau markierte Regionen gehören zur linken, violett markierte Regionen zur rechten Trackpadhälfte.</desc>',
    rows,
    "</svg>",
  ].join("")
}
