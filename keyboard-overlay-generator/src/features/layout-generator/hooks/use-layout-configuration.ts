import * as React from "react"

import { createLayoutConfiguration } from "../core/configuration"
import type { LayoutConfiguration, LayoutFormValues } from "../model/types"

interface LayoutConfigurationState {
  configuration: LayoutConfiguration | null
  error: string
}

function buildConfigurationState(values: LayoutFormValues): LayoutConfigurationState {
  try {
    return { configuration: createLayoutConfiguration(values), error: "" }
  } catch (error) {
    return {
      configuration: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function useLayoutConfiguration(values: LayoutFormValues, valid: boolean) {
  const [state, setState] = React.useState<LayoutConfigurationState>(() => (
    valid ? buildConfigurationState(values) : { configuration: null, error: "" }
  ))

  React.useEffect(() => {
    if (!valid) return
    try {
      setState({ configuration: createLayoutConfiguration(values), error: "" })
    } catch (error) {
      setState((current) => ({
        configuration: current.configuration,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }, [values, valid])

  return state
}
