import { z } from 'zod'

// HTTP methods supported
export const HttpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const

export type HttpMethod = (typeof HttpMethods)[number]

// Base interface for a network request
export interface NetworkRequest {
  requestId: string // Unique CDP request identifier
  url: string // Full request URL
  method: HttpMethod // HTTP method
  status?: number // HTTP status code, undefined if pending
  origin: string // Request origin/referrer
  timestamp: number // Request start time (Unix ms)
  duration?: number // Request duration in ms, undefined if pending
  requestHeaders: Record<string, string>
  responseHeaders?: Record<string, string> // undefined if pending
  failed: boolean // true if request failed
}

// Zod schema for the base request fields
export const NetworkRequestSchema = z
  .object({
    requestId: z
      .string({ required_error: 'requestId is required' })
      .min(1, 'requestId cannot be empty'),
    url: z.string({ required_error: 'url is required' }).url('url must be a valid HTTP/HTTPS URL'),
    method: z.enum(HttpMethods),
    status: z
      .number()
      .int('status must be an integer')
      .min(100, 'status must be 100-599')
      .max(599, 'status must be 100-599')
      .optional(),
    origin: z.string({ required_error: 'origin is required' }).min(1, 'origin cannot be empty'),
    timestamp: z
      .number({ required_error: 'timestamp is required' })
      .int('timestamp must be an integer')
      .gt(0, 'timestamp must be a positive integer'),
    duration: z.number().min(0, 'duration must be non-negative').optional(),
    requestHeaders: z.record(z.string()),
    responseHeaders: z.record(z.string()).optional(),
    failed: z.boolean(),
  })
  .strict()

// State machine for NetworkRequest lifecycle
export enum NetworkRequestState {
  Created = 'Created',
  Updated = 'Updated',
  Completed = 'Completed',
  Failed = 'Failed',
}

export type StatefulNetworkRequest = NetworkRequest & { state: NetworkRequestState }

export const StatefulNetworkRequestSchema = NetworkRequestSchema.extend({
  state: z.nativeEnum(NetworkRequestState),
}).strict()

// Valid transitions map
const VALID_TRANSITIONS: Record<NetworkRequestState, NetworkRequestState[]> = {
  [NetworkRequestState.Created]: [NetworkRequestState.Updated, NetworkRequestState.Failed],
  [NetworkRequestState.Updated]: [NetworkRequestState.Completed, NetworkRequestState.Failed],
  [NetworkRequestState.Completed]: [],
  [NetworkRequestState.Failed]: [],
}

export function isValidTransition(from: NetworkRequestState, to: NetworkRequestState): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export function createNetworkRequest(
  input: z.input<typeof NetworkRequestSchema>,
): StatefulNetworkRequest {
  const data = NetworkRequestSchema.parse(input)
  return { ...data, state: NetworkRequestState.Created }
}

export function toUpdated(request: StatefulNetworkRequest): StatefulNetworkRequest {
  if (request.state !== NetworkRequestState.Created) {
    throw new Error(`Invalid transition: ${request.state} -> ${NetworkRequestState.Updated}`)
  }
  return { ...request, state: NetworkRequestState.Updated }
}

export function toCompleted(request: StatefulNetworkRequest): StatefulNetworkRequest {
  if (request.state !== NetworkRequestState.Updated) {
    throw new Error(`Invalid transition: ${request.state} -> ${NetworkRequestState.Completed}`)
  }
  return { ...request, state: NetworkRequestState.Completed }
}

export function toFailed(request: StatefulNetworkRequest): StatefulNetworkRequest {
  if (![NetworkRequestState.Created, NetworkRequestState.Updated].includes(request.state)) {
    throw new Error(`Invalid transition: ${request.state} -> ${NetworkRequestState.Failed}`)
  }
  return { ...request, state: NetworkRequestState.Failed }
}

export function isNetworkRequest(value: unknown): value is NetworkRequest {
  const res = NetworkRequestSchema.safeParse(value)
  return res.success
}

export function parseNetworkRequest(value: unknown): NetworkRequest | undefined {
  const res = NetworkRequestSchema.safeParse(value)
  return res.success ? res.data : undefined
}
