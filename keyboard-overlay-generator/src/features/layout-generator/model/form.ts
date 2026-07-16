import { z } from "zod"

import type { LayoutFormValues } from "./types"

const numberRange = (min: number, max: number) => z.number().min(min).max(max)

export const layoutFormSchema = z.object({
  presetId: z.enum(["alpha-de", "iso-de"]),
  labelProfile: z.enum(["pc", "macos", "primary"]),
  splitPercent: numberRange(35, 65),
  assignment: z.enum(["magic-left", "magic-right"]),
  scalingMode: z.enum(["common", "independent"]),
  rowStaggerPercent: numberRange(0, 150),
  maskAlignment: z.enum(["bottom", "center", "top"]),
  maskMarginMm: numberRange(4, 24),
  keyBlockInsetMm: numberRange(1, 12),
  actions: z.object({
    left: z.object({ space: z.boolean(), backspace: z.boolean(), backspaceShare: numberRange(5, 95) }),
    right: z.object({ space: z.boolean(), backspace: z.boolean(), backspaceShare: numberRange(5, 95) }),
  }),
  devices: z.object({
    magic: z.object({ widthMm: numberRange(80, 300), heightMm: numberRange(60, 200) }),
    macbook: z.object({ widthMm: numberRange(80, 300), heightMm: numberRange(60, 200) }),
  }),
  panelRadiusMm: numberRange(0, 30),
  keyRadiusMm: numberRange(0, 8),
  keySpacingMm: numberRange(0.25, 3),
  colors: z.object({
    panel: z.string().regex(/^#[0-9a-f]{6}$/i),
    key: z.string().regex(/^#[0-9a-f]{6}$/i),
    outline: z.string().regex(/^#[0-9a-f]{6}$/i),
    text: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  opacity: z.object({ panel: numberRange(0, 100), key: numberRange(0, 100) }),
  pixelsPerMm: numberRange(2, 30),
}) satisfies z.ZodType<LayoutFormValues>

export const defaultLayoutFormValues: LayoutFormValues = {
  presetId: "iso-de",
  labelProfile: "macos",
  splitPercent: 50,
  assignment: "magic-right",
  scalingMode: "common",
  rowStaggerPercent: 100,
  maskAlignment: "bottom",
  maskMarginMm: 8,
  keyBlockInsetMm: 5,
  actions: {
    left: { space: true, backspace: false, backspaceShare: 30 },
    right: { space: true, backspace: false, backspaceShare: 30 },
  },
  devices: {
    magic: { widthMm: 160, heightMm: 114.9 },
    macbook: { widthMm: 160, heightMm: 100 },
  },
  panelRadiusMm: 4,
  keyRadiusMm: 1.5,
  keySpacingMm: 1,
  colors: { panel: "#4f46e5", key: "#f8fafc", outline: "#312e81", text: "#111827" },
  opacity: { panel: 0, key: 22 },
  pixelsPerMm: 10,
}
