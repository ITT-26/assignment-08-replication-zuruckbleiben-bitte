import { useForm } from "@tanstack/react-form"

import { defaultLayoutFormValues, layoutFormSchema } from "../model/form"

export function useLayoutForm() {
  return useForm({
    defaultValues: structuredClone(defaultLayoutFormValues),
    validators: { onChange: layoutFormSchema },
    onSubmit: async () => undefined,
  })
}

export type LayoutFormApi = ReturnType<typeof useLayoutForm>
