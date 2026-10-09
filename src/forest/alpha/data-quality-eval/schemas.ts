import { z } from 'zod';
import { DataQualityConfigSchema } from './schemas-configs';

export * from './schemas-base';
export * from './schemas-configs';
export * from './schemas-eval';

export const DataQualityEvalConfigSchema = DataQualityConfigSchema.extend({
  reportTitle: z.string().min(1).optional(),
  generatedAt: z.number().int().nonnegative().optional(),
}).strict();
