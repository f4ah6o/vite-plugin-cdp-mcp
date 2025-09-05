import { z } from 'zod'

// Browser target types supported
export const BrowserTargetTypes = ['page', 'background_page', 'service_worker', 'other'] as const

export type BrowserTargetType = (typeof BrowserTargetTypes)[number]

// Base interface for a browser target
export interface BrowserTarget {
  id: string // CDP target identifier
  url: string // Target page URL
  title: string // Page title (can be empty)
  type: BrowserTargetType // Target type
  attached: boolean // Whether we're attached to this target
  canAttach: boolean // Whether target supports attachment
  lastActivity: number // Last interaction timestamp (Unix ms)
}

// Zod schema for the base target fields
export const BrowserTargetSchema = z
  .object({
    id: z.string({ required_error: 'id is required' }).min(1, 'id cannot be empty'),
    url: z.string({ required_error: 'url is required' }).url('url must be a valid URL'),
    title: z.string().default(''), // Can be empty string
    type: z.enum(BrowserTargetTypes),
    attached: z.boolean(),
    canAttach: z.boolean(),
    lastActivity: z
      .number({ required_error: 'lastActivity is required' })
      .int('lastActivity must be an integer')
      .gt(0, 'lastActivity must be a positive integer'),
  })
  .strict()

// State machine for BrowserTarget lifecycle
export enum BrowserTargetState {
  Discovered = 'Discovered',
  Attached = 'Attached',
  Active = 'Active',
  Detached = 'Detached',
}

export type StatefulBrowserTarget = BrowserTarget & { state: BrowserTargetState }

export const StatefulBrowserTargetSchema = BrowserTargetSchema.extend({
  state: z.nativeEnum(BrowserTargetState),
}).strict()

// Valid transitions map
const VALID_TRANSITIONS: Record<BrowserTargetState, BrowserTargetState[]> = {
  [BrowserTargetState.Discovered]: [BrowserTargetState.Attached, BrowserTargetState.Detached],
  [BrowserTargetState.Attached]: [BrowserTargetState.Active, BrowserTargetState.Detached],
  [BrowserTargetState.Active]: [BrowserTargetState.Detached],
  [BrowserTargetState.Detached]: [],
}

export function isValidTransition(from: BrowserTargetState, to: BrowserTargetState): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export function createBrowserTarget(
  input: z.input<typeof BrowserTargetSchema>,
): StatefulBrowserTarget {
  const data = BrowserTargetSchema.parse(input)
  return { ...data, state: BrowserTargetState.Discovered }
}

export function toAttached(target: StatefulBrowserTarget): StatefulBrowserTarget {
  if (target.state !== BrowserTargetState.Discovered) {
    throw new Error(`Invalid transition: ${target.state} -> ${BrowserTargetState.Attached}`)
  }
  return { ...target, state: BrowserTargetState.Attached }
}

export function toActive(target: StatefulBrowserTarget): StatefulBrowserTarget {
  if (target.state !== BrowserTargetState.Attached) {
    throw new Error(`Invalid transition: ${target.state} -> ${BrowserTargetState.Active}`)
  }
  return { ...target, state: BrowserTargetState.Active }
}

export function toDetached(target: StatefulBrowserTarget): StatefulBrowserTarget {
  if (target.state === BrowserTargetState.Detached) {
    throw new Error(`Invalid transition: ${target.state} -> ${BrowserTargetState.Detached}`)
  }
  return { ...target, state: BrowserTargetState.Detached }
}

export function isBrowserTarget(value: unknown): value is BrowserTarget {
  const res = BrowserTargetSchema.safeParse(value)
  return res.success
}

export function parseBrowserTarget(value: unknown): BrowserTarget | undefined {
  const res = BrowserTargetSchema.safeParse(value)
  return res.success ? res.data : undefined
}

// Target selection priority logic
export function isLocalhost5173Target(target: BrowserTarget): boolean {
  try {
    const url = new URL(target.url)
    return url.hostname === 'localhost' && url.port === '5173'
  } catch {
    return false
  }
}

export function selectPriorityTarget(targets: BrowserTarget[]): BrowserTarget | undefined {
  // First priority: localhost:5173 targets that can be attached
  const localhost5173Targets = targets.filter(
    (target) => isLocalhost5173Target(target) && target.canAttach,
  )
  if (localhost5173Targets.length > 0) {
    return localhost5173Targets[0]
  }

  // Second priority: any localhost targets that can be attached
  const localhostTargets = targets.filter((target) => {
    try {
      const url = new URL(target.url)
      return url.hostname === 'localhost' && target.canAttach
    } catch {
      return false
    }
  })
  if (localhostTargets.length > 0) {
    return localhostTargets[0]
  }

  // Third priority: any attachable target
  const attachableTargets = targets.filter((target) => target.canAttach)
  if (attachableTargets.length > 0) {
    return attachableTargets[0]
  }

  return undefined
}
