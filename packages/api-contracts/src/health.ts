import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  environment: z.enum(['development', 'staging', 'production']),
  checks: z.object({
    database: z.enum(['ok', 'fail']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
