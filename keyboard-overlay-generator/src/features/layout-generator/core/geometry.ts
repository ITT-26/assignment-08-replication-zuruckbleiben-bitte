import type {
  IsoPreset,
  IsoPresetKey,
  IsoPresetRow,
  IsoSideMetrics,
  LayoutOptions,
  LayoutRegion,
  NormalizedBounds,
  NormalizedDevice,
  Side,
} from "../model/types"

export interface RowWithAssignments {
  row: IsoPresetRow
  assignments: Map<string, Side>
}

export function getRowsWithAssignments(preset: IsoPreset, splitPercent: number): RowWithAssignments[] {
  return preset.rows.map((row) => ({
    row,
    assignments: getIsoRowAssignments(row, preset, splitPercent),
  }))
}

export function insetNormalizedBounds(source: NormalizedBounds, device: NormalizedDevice, insetMm: number) {
  const insetX = Math.min(insetMm / device.widthMm, 0.2)
  const insetY = Math.min(insetMm / device.heightMm, 0.2)
  const contentWidth = 1 - insetX * 2
  const contentHeight = 1 - insetY * 2
  return {
    x0: insetX + source.x0 * contentWidth,
    y0: insetY + source.y0 * contentHeight,
    x1: insetX + source.x1 * contentWidth,
    y1: insetY + source.y1 * contentHeight,
  }
}

export function insetRegionsForSpacing(regions: LayoutRegion[], options: LayoutOptions) {
  const halfGap = options.keySpacingMm / 2
  return regions.map((region) => {
    const device = region.role === "built-in" ? options.devices.macbook : options.devices.magic
    const insetX = Math.min(halfGap / device.widthMm, (region.x1 - region.x0) / 4)
    const insetY = Math.min(halfGap / device.heightMm, (region.y1 - region.y0) / 4)
    return {
      ...region,
      x0: region.x0 + insetX,
      y0: region.y0 + insetY,
      x1: region.x1 - insetX,
      y1: region.y1 - insetY,
    }
  })
}

export function calculateIsoSideMetrics(
  side: Side,
  preset: IsoPreset,
  rowsWithAssignments: RowWithAssignments[],
  rowStaggerPercent: number,
): IsoSideMetrics {
  const fullRowWidths = preset.rows.map((row) => calculateRowWidth(row.keys))
  const maxFullRowWidth = Math.max(...fullRowWidths)
  const rows = rowsWithAssignments.map(({ row, assignments }, rowIndex) => {
    let cursor = (maxFullRowWidth - fullRowWidths[rowIndex]) / 2 * rowStaggerPercent / 100
    const keys: Array<{ key: IsoPresetKey; x: number }> = []
    row.keys.forEach((key) => {
      if (assignments.get(key.id) === side) keys.push({ key, x: cursor })
      cursor += key.width
    })
    return { id: row.id, keys }
  })
  const positionedKeys = rows.flatMap((row) => row.keys)
  const minX = Math.min(...positionedKeys.map(({ x }) => x))
  const maxX = Math.max(...positionedKeys.map(({ key, x }) => x + key.width))
  rows.forEach((row) => row.keys.forEach((entry) => { entry.x -= minX }))
  return {
    side,
    rows,
    width: maxX - minX,
    height: rows.length * preset.geometry.key_height,
  }
}

export function calculateFitScale(
  device: NormalizedDevice,
  metrics: IsoSideMetrics,
  paddingMm: number,
  alignment: LayoutOptions["maskAlignment"] = "center",
  marginMm = paddingMm,
) {
  const availableWidth = Math.max(1, device.widthMm - paddingMm * 2)
  const verticalMargins = alignment === "center" ? paddingMm * 2 : paddingMm + marginMm
  const availableHeight = Math.max(1, device.heightMm - verticalMargins)
  return Math.min(availableWidth / metrics.width, availableHeight / metrics.height)
}

export function calculateMaskOriginY(
  deviceHeightMm: number,
  layoutHeightMm: number,
  alignment: LayoutOptions["maskAlignment"],
  marginMm: number,
) {
  const freeSpace = Math.max(0, deviceHeightMm - layoutHeightMm)
  if (alignment === "bottom") return Math.max(0, freeSpace - marginMm)
  if (alignment === "top") return Math.min(marginMm, freeSpace)
  return freeSpace / 2
}

function getIsoRowAssignments(row: IsoPresetRow, preset: IsoPreset, splitPercent: number) {
  const fixed = new Map<string, Side>()
  row.keys.forEach((key) => {
    if (key.fixed_side) fixed.set(key.id, key.fixed_side)
  })
  const movable = row.keys.filter((key) => !key.fixed_side)
  if (movable.length < 2) {
    return new Map(row.keys.map((key) => [key.id, key.fixed_side || "left"] as const))
  }

  const allWidths = preset.rows.map((candidate) => calculateRowWidth(candidate.keys))
  const maxWidth = Math.max(...allWidths)
  const rowWidth = calculateRowWidth(row.keys)
  const rowOrigin = (maxWidth - rowWidth) / 2
  const positions = new Map<string, { start: number; end: number }>()
  let cursor = rowOrigin
  row.keys.forEach((key) => {
    positions.set(key.id, { start: cursor, end: cursor + key.width })
    cursor += key.width
  })

  const splitX = maxWidth * splitPercent / 100
  const candidates: Array<{ cut: number; gapX: number }> = []
  for (let cut = 1; cut < movable.length; cut += 1) {
    const previous = positions.get(movable[cut - 1].id)
    const next = positions.get(movable[cut].id)
    if (previous && next) candidates.push({ cut, gapX: (previous.end + next.start) / 2 })
  }
  candidates.sort((left, right) => Math.abs(left.gapX - splitX) - Math.abs(right.gapX - splitX))
  const cut = candidates[0].cut
  const assignments = new Map(fixed)
  movable.forEach((key, index) => assignments.set(key.id, index < cut ? "left" : "right"))
  return assignments
}

function calculateRowWidth(keys: IsoPresetKey[]) {
  return keys.reduce((sum, key) => sum + key.width, 0)
}
