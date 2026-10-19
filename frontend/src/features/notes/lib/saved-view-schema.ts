import { z } from 'zod'

// Keep these input constraints aligned with the savedViews Rules validator.
export const savedViewInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a view name.')
      .max(60, 'Use at most 60 characters for the name.'),
    keyword: z.string().trim().max(100, 'Use at most 100 characters for the keyword.'),
    sortDirection: z.enum(['asc', 'desc']),
  })
  .strict()

export type SavedViewInput = z.infer<typeof savedViewInputSchema>
