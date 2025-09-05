import { z } from 'zod'
import { ConsoleEntry, ConsoleEntrySchema } from './console-entry.js'

// Base interface for a runtime evaluation
export interface RuntimeEvaluation {
  id: string // Unique evaluation identifier
  expression: string // JavaScript code to evaluate
  timestamp: number // Evaluation start time (Unix ms)
  result?: any // Evaluation result value
  error?: string // Error message if evaluation failed
  consoleOutput: ConsoleEntry[] // Console logs generated during evaluation
  duration: number // Evaluation time in milliseconds
}

// Zod schema for the base evaluation fields
// Define a base schema as a ZodObject so it can be extended
const RuntimeEvaluationBaseSchema = z
  .object({
    id: z.string({ required_error: 'id is required' }).min(1, 'id cannot be empty'),
    expression: z
      .string({ required_error: 'expression is required' })
      .min(1, 'expression cannot be empty'),
    timestamp: z
      .number({ required_error: 'timestamp is required' })
      .int('timestamp must be an integer')
      .gt(0, 'timestamp must be a positive integer'),
    result: z.any().optional(),
    error: z.string().optional(),
    consoleOutput: z.array(ConsoleEntrySchema),
    duration: z
      .number({ required_error: 'duration is required' })
      .min(0, 'duration must be non-negative'),
  })
  .strict()

// Public schema with XOR validation for general validation use
export const RuntimeEvaluationSchema = RuntimeEvaluationBaseSchema.superRefine((data, ctx) => {
  const hasResult = data.result !== undefined
  const hasError = data.error !== undefined
  if (hasResult === hasError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either result or error should be present, but not both',
    })
  }
})

// State machine for RuntimeEvaluation lifecycle
export enum RuntimeEvaluationState {
  Created = 'Created',
  Executed = 'Executed',
  Completed = 'Completed',
  Failed = 'Failed',
}

export type StatefulRuntimeEvaluation = RuntimeEvaluation & { state: RuntimeEvaluationState }

// Extend from the base object schema so that `.extend` is valid
export const StatefulRuntimeEvaluationSchema = RuntimeEvaluationBaseSchema
  .extend({
    state: z.nativeEnum(RuntimeEvaluationState),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasResult = data.result !== undefined
    const hasError = data.error !== undefined
    if (data.state === RuntimeEvaluationState.Completed) {
      if (!hasResult || hasError) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Completed evaluations must include result and no error',
        })
      }
    } else if (data.state === RuntimeEvaluationState.Failed) {
      if (!hasError || hasResult) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Failed evaluations must include error and no result',
        })
      }
    } else {
      // Created/Executed should not include result or error
      if (hasResult || hasError) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Created/Executed evaluations must not include result or error',
        })
      }
    }
  })

// Valid transitions map
const VALID_TRANSITIONS: Record<RuntimeEvaluationState, RuntimeEvaluationState[]> = {
  [RuntimeEvaluationState.Created]: [RuntimeEvaluationState.Executed],
  [RuntimeEvaluationState.Executed]: [
    RuntimeEvaluationState.Completed,
    RuntimeEvaluationState.Failed,
  ],
  [RuntimeEvaluationState.Completed]: [],
  [RuntimeEvaluationState.Failed]: [],
}

export function isValidTransition(
  from: RuntimeEvaluationState,
  to: RuntimeEvaluationState,
): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export function createRuntimeEvaluation(
  input: z.input<typeof RuntimeEvaluationSchema>,
): StatefulRuntimeEvaluation {
  // Allow creating an evaluation without result/error (interim state)
  const data = RuntimeEvaluationBaseSchema.parse(input)
  return { ...data, state: RuntimeEvaluationState.Created }
}

export function toExecuted(evaluation: StatefulRuntimeEvaluation): StatefulRuntimeEvaluation {
  if (evaluation.state !== RuntimeEvaluationState.Created) {
    throw new Error(`Invalid transition: ${evaluation.state} -> ${RuntimeEvaluationState.Executed}`)
  }
  return { ...evaluation, state: RuntimeEvaluationState.Executed }
}

export function toCompleted(evaluation: StatefulRuntimeEvaluation): StatefulRuntimeEvaluation {
  if (evaluation.state !== RuntimeEvaluationState.Executed) {
    throw new Error(
      `Invalid transition: ${evaluation.state} -> ${RuntimeEvaluationState.Completed}`,
    )
  }
  return { ...evaluation, state: RuntimeEvaluationState.Completed }
}

export function toFailed(evaluation: StatefulRuntimeEvaluation): StatefulRuntimeEvaluation {
  if (evaluation.state !== RuntimeEvaluationState.Executed) {
    throw new Error(`Invalid transition: ${evaluation.state} -> ${RuntimeEvaluationState.Failed}`)
  }
  return { ...evaluation, state: RuntimeEvaluationState.Failed }
}

export function isRuntimeEvaluation(value: unknown): value is RuntimeEvaluation {
  const res = RuntimeEvaluationSchema.safeParse(value)
  return res.success
}

export function parseRuntimeEvaluation(value: unknown): RuntimeEvaluation | undefined {
  const res = RuntimeEvaluationSchema.safeParse(value)
  return res.success ? res.data : undefined
}
