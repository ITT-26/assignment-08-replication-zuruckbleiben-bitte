import presetDataJson from "@/data/layout-presets.json"

import { assertPresetData } from "../core/validation"

const presetCandidate: unknown = presetDataJson
assertPresetData(presetCandidate)

export const presetData = presetCandidate
