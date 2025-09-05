import { describe, it, expect } from 'vitest'

// Console Entry
import {
  ConsoleEntrySchema,
  ConsoleEntryState,
  createConsoleEntry,
  isConsoleEntry,
  parseConsoleEntry,
  toBuffered as consoleToBuffered,
  toStreamed as consoleToStreamed,
} from '../../src/models/console-entry'

// Network Request
import {
  NetworkRequestSchema,
  NetworkRequestState,
  createNetworkRequest,
  isNetworkRequest,
  parseNetworkRequest,
  toCompleted as requestToCompleted,
  toFailed as requestToFailed,
  toUpdated as requestToUpdated,
} from '../../src/models/network-request'

// Browser Target
import {
  BrowserTargetSchema,
  isBrowserTarget,
  parseBrowserTarget,
  selectPriorityTarget,
  isLocalhost5173Target,
  BrowserTargetState,
  createBrowserTarget,
  toActive as targetToActive,
  toAttached as targetToAttached,
  toDetached as targetToDetached,
} from '../../src/models/browser-target'

// Runtime Evaluation
import {
  RuntimeEvaluationSchema,
  RuntimeEvaluationState,
  createRuntimeEvaluation,
  isRuntimeEvaluation,
  parseRuntimeEvaluation,
  toCompleted as evalToCompleted,
  toExecuted as evalToExecuted,
  toFailed as evalToFailed,
} from '../../src/models/runtime-evaluation'

// Helpers
const now = 1725540000000

describe('T026 Unit: Model Validation', () => {
  describe('ConsoleEntry', () => {
    it('validates a correct entry', () => {
      const input = {
        level: 'info',
        timestamp: now,
        message: 'Hello',
        source: 'src/main.ts:12:3',
      }
      const parsed = ConsoleEntrySchema.parse(input)
      expect(parsed).toEqual(input)
      expect(isConsoleEntry(input)).toBe(true)
      expect(parseConsoleEntry(input)).toEqual(input)
    })

    it("accepts 'unknown' as source and rejects malformed source", () => {
      const ok = {
        level: 'log',
        timestamp: now,
        message: 'm',
        source: 'unknown',
      }
      expect(() => ConsoleEntrySchema.parse(ok)).not.toThrow()

      const bad = { ...ok, source: 'file.ts:10' } // missing :column
      expect(() => ConsoleEntrySchema.parse(bad as any)).toThrow()
    })

    it('enforces positive integer timestamp and non-empty message', () => {
      const nonInt = { level: 'warn', timestamp: 1.2, message: 'x', source: 'a.ts:1:1' }
      const nonPos = { level: 'warn', timestamp: 0, message: 'x', source: 'a.ts:1:1' }
      const emptyMsg = { level: 'warn', timestamp: 1, message: '', source: 'a.ts:1:1' }
      expect(() => ConsoleEntrySchema.parse(nonInt as any)).toThrow()
      expect(() => ConsoleEntrySchema.parse(nonPos as any)).toThrow()
      expect(() => ConsoleEntrySchema.parse(emptyMsg as any)).toThrow()
    })

    it('state transitions: Created -> Buffered -> Streamed; invalid transitions throw', () => {
      const entry = createConsoleEntry({
        level: 'debug',
        timestamp: now,
        message: 'm',
        source: 'a.ts:1:1',
      })
      expect(entry.state).toBe(ConsoleEntryState.Created)
      const buffered = consoleToBuffered(entry)
      expect(buffered.state).toBe(ConsoleEntryState.Buffered)
      const streamed = consoleToStreamed(buffered)
      expect(streamed.state).toBe(ConsoleEntryState.Streamed)

      // Invalid: Streamed -> Buffered
      expect(() => consoleToBuffered(streamed as any)).toThrow()
      // Invalid: Created -> Streamed
      expect(() => consoleToStreamed(entry as any)).toThrow()
    })
  })

  describe('NetworkRequest', () => {
    it('validates a correct request and optional fields', () => {
      const input = {
        requestId: 'req-1',
        url: 'http://localhost:5173/assets/app.js',
        method: 'GET',
        origin: 'http://localhost:5173',
        timestamp: now,
        requestHeaders: { Accept: '*/*' },
        failed: false,
      }
      const parsed = NetworkRequestSchema.parse(input)
      expect(parsed).toEqual(input)
      expect(isNetworkRequest(input)).toBe(true)
      expect(parseNetworkRequest(input)).toEqual(input)

      const withStatus = { ...input, status: 200, duration: 12.5, responseHeaders: { 'x': 'y' } }
      expect(() => NetworkRequestSchema.parse(withStatus)).not.toThrow()
    })

    it('rejects invalid url, status range and timestamp', () => {
      const base = {
        requestId: 'id',
        url: 'notaurl',
        method: 'POST',
        origin: 'o',
        timestamp: now,
        requestHeaders: {},
        failed: false,
      }
      expect(() => NetworkRequestSchema.parse(base as any)).toThrow()

      const badStatus = { ...base, url: 'https://a.com', status: 42 }
      expect(() => NetworkRequestSchema.parse(badStatus as any)).toThrow()

      const nonIntTs = { ...base, url: 'https://a.com', timestamp: 1.1 }
      expect(() => NetworkRequestSchema.parse(nonIntTs as any)).toThrow()
    })

    it('state transitions: Created -> Updated -> Completed | Failed; invalid transitions throw', () => {
      const req = createNetworkRequest({
        requestId: 'r1',
        url: 'https://example.com',
        method: 'GET',
        origin: 'https://ref',
        timestamp: now,
        requestHeaders: {},
        failed: false,
      })
      expect(req.state).toBe(NetworkRequestState.Created)
      const updated = requestToUpdated(req)
      expect(updated.state).toBe(NetworkRequestState.Updated)
      const completed = requestToCompleted(updated)
      expect(completed.state).toBe(NetworkRequestState.Completed)

      // Created -> Failed is allowed
      const req2 = createNetworkRequest({
        requestId: 'r2',
        url: 'https://example.com',
        method: 'GET',
        origin: 'https://ref',
        timestamp: now,
        requestHeaders: {},
        failed: false,
      })
      const failedFromCreated = requestToFailed(req2)
      expect(failedFromCreated.state).toBe(NetworkRequestState.Failed)

      // Invalid: Completed -> Failed
      expect(() => requestToFailed(completed as any)).toThrow()
      // Invalid: Created -> Completed
      expect(() => requestToCompleted(req as any)).toThrow()
    })
  })

  describe('BrowserTarget', () => {
    it('validates correct target and defaults', () => {
      const input = {
        id: 't1',
        url: 'http://localhost:5173/',
        title: 'Vite App',
        type: 'page',
        attached: false,
        canAttach: true,
        lastActivity: now,
      }
      const parsed = BrowserTargetSchema.parse(input)
      expect(parsed).toEqual(input)
      expect(isBrowserTarget(input)).toBe(true)
      expect(parseBrowserTarget(input)).toEqual(input)

      // Title can be empty string and remains as provided
      const noTitle = { ...input, title: '' }
      expect(() => BrowserTargetSchema.parse(noTitle)).not.toThrow()
    })

    it('rejects invalid url and lastActivity', () => {
      const bad = {
        id: 't',
        url: 'not-a-url',
        title: '',
        type: 'page',
        attached: false,
        canAttach: true,
        lastActivity: now,
      }
      expect(() => BrowserTargetSchema.parse(bad as any)).toThrow()

      const nonInt = { ...bad, url: 'https://example.com', lastActivity: 1.2 }
      expect(() => BrowserTargetSchema.parse(nonInt as any)).toThrow()
    })

    it('target selection prioritizes localhost:5173 > localhost > attachable', () => {
      const mk = (id: string, url: string, canAttach: boolean) => ({
        id,
        url,
        title: '',
        type: 'page' as const,
        attached: false,
        canAttach,
        lastActivity: now,
      })

      const targets = [
        mk('1', 'https://example.com', true),
        mk('2', 'http://localhost:3000/', true),
        mk('3', 'http://localhost:5173/', true),
        mk('4', 'http://localhost:5173/', false),
      ]

      expect(isLocalhost5173Target(targets[2])).toBe(true)
      expect(selectPriorityTarget(targets)?.id).toBe('3')

      // Remove 5173, expect any localhost attachable
      const t2 = targets.filter((t) => t.id !== '3')
      expect(selectPriorityTarget(t2)?.id).toBe('2')

      // Remove localhost attachable, expect any attachable
      const t3 = t2.filter((t) => t.id !== '2')
      expect(selectPriorityTarget(t3)?.id).toBe('1')

      // None attachable
      const t4 = t3.map((t) => ({ ...t, canAttach: false }))
      expect(selectPriorityTarget(t4)).toBeUndefined()
    })

    it('state transitions: Discovered -> Attached -> Active -> Detached; invalid transitions throw', () => {
      const target = createBrowserTarget({
        id: 't',
        url: 'http://localhost:5173/',
        title: '',
        type: 'page',
        attached: false,
        canAttach: true,
        lastActivity: now,
      })
      expect(target.state).toBe(BrowserTargetState.Discovered)
      const attached = targetToAttached(target)
      expect(attached.state).toBe(BrowserTargetState.Attached)
      const active = targetToActive(attached)
      expect(active.state).toBe(BrowserTargetState.Active)
      const detached = targetToDetached(active)
      expect(detached.state).toBe(BrowserTargetState.Detached)

      // Invalid: Detached -> Detached
      expect(() => targetToDetached(detached as any)).toThrow()
      // Invalid: Active -> Attached
      expect(() => targetToAttached(active as any)).toThrow()
    })
  })

  describe('RuntimeEvaluation', () => {
    it('validates XOR of result and error', () => {
      const base = {
        id: 'e1',
        expression: '1+1',
        timestamp: now,
        consoleOutput: [
          { level: 'log', timestamp: now, message: 'm', source: 'a.ts:1:1' },
        ],
        duration: 0,
      }

      const okResult = { ...base, result: 2 }
      expect(() => RuntimeEvaluationSchema.parse(okResult)).not.toThrow()

      const okError = { ...base, error: 'Boom' }
      expect(() => RuntimeEvaluationSchema.parse(okError)).not.toThrow()

      const both = { ...base, result: 2, error: 'x' }
      expect(() => RuntimeEvaluationSchema.parse(both as any)).toThrow()

      const neither = base
      expect(() => RuntimeEvaluationSchema.parse(neither as any)).toThrow()
    })

    it('state transitions: Created -> Executed -> Completed | Failed; invalid transitions throw', () => {
      const ev = createRuntimeEvaluation({
        id: 'e1',
        expression: '2+2',
        timestamp: now,
        consoleOutput: [],
        duration: 0,
        result: 4,
      })
      expect(ev.state).toBe(RuntimeEvaluationState.Created)
      const exec = evalToExecuted(ev)
      expect(exec.state).toBe(RuntimeEvaluationState.Executed)
      const completed = evalToCompleted(exec)
      expect(completed.state).toBe(RuntimeEvaluationState.Completed)

      const ev2 = createRuntimeEvaluation({
        id: 'e2',
        expression: 'throw new Error()',
        timestamp: now,
        consoleOutput: [],
        duration: 1,
        error: 'fail',
      })
      const exec2 = evalToExecuted(ev2)
      const failed = evalToFailed(exec2)
      expect(failed.state).toBe(RuntimeEvaluationState.Failed)

      // Invalid: Created -> Completed
      expect(() => evalToCompleted(ev as any)).toThrow()
      // Invalid: Completed -> Failed
      expect(() => evalToFailed(completed as any)).toThrow()
    })

    it('guards and parsers work', () => {
      const good = {
        id: 'e3',
        expression: 'ok',
        timestamp: now,
        consoleOutput: [],
        duration: 0,
        result: null,
      }
      expect(isRuntimeEvaluation(good)).toBe(true)
      expect(parseRuntimeEvaluation(good)).toEqual(good)

      const bad = { ...good, timestamp: 0 }
      expect(isRuntimeEvaluation(bad)).toBe(false)
      expect(parseRuntimeEvaluation(bad)).toBeUndefined()
    })
  })
})

