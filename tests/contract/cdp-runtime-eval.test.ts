import { describe, it, expect } from 'vitest'
import Ajv, { type ErrorObject } from 'ajv'
import tools from '../../specs/001-docs-plan-md/contracts/mcp-tools.json'

const ajv = new Ajv({ allErrors: true, strict: false })

const cdpRuntimeEval = (tools as any).tools['cdp.runtime.eval']
const inputSchema = cdpRuntimeEval.inputSchema
const outputSchema = cdpRuntimeEval.outputSchema

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return ''
  return errors.map((e) => `${e.instancePath} [${e.keyword}] ${e.message}`).join('; ')
}

describe('T006 Contract: cdp.runtime.eval schemas', () => {
  describe('Input schema validation (expression, awaitPromise, timeout)', () => {
    const validateInput = ajv.compile(inputSchema)

    it('accepts minimal valid input (expression only)', () => {
      const data = { expression: '1 + 1' }
      const valid = validateInput(data)
      if (!valid) throw new Error(`Expected valid input: ${formatErrors(validateInput.errors)}`)
    })

    it('accepts valid values for awaitPromise and timeout', () => {
      const data = { expression: 'Promise.resolve(42)', awaitPromise: true, timeout: 1500 }
      const valid = validateInput(data)
      if (!valid) throw new Error(`Expected valid input: ${formatErrors(validateInput.errors)}`)
    })

    it('rejects missing required expression', () => {
      const data = {}
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('required')
    })

    it('rejects empty expression', () => {
      const data = { expression: '' }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('minLength')
    })

    it('rejects non-boolean awaitPromise', () => {
      const data = { expression: 'true', awaitPromise: 'yes' as any }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('boolean')
    })

    it('rejects timeout below minimum', () => {
      const data = { expression: '1', timeout: 50 }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('minimum')
    })

    it('rejects timeout above maximum', () => {
      const data = { expression: '1', timeout: 60000 }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('maximum')
    })

    it('rejects non-integer timeout', () => {
      const data = { expression: '1', timeout: 123.45 }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('integer')
    })

    it('rejects additional properties', () => {
      const data = { expression: '1', foo: 'bar' }
      const valid = validateInput(data as any)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('additionalProperties')
    })
  })

  describe('Output schema validation (result/error, consoleOutput, duration, target)', () => {
    const validateOutput = ajv.compile(outputSchema)

    it('accepts a valid success output with result', () => {
      const data = {
        id: 'eval-1',
        expression: '2 * 3',
        timestamp: 1725541000123,
        result: 6,
        consoleOutput: [
          { level: 'log', message: 'running eval', timestamp: 1725541000124 },
          { level: 'info', message: 'done', timestamp: 1725541000125 },
        ],
        duration: 10.5,
        target: { id: 'target-1', url: 'http://localhost:5173/', title: 'Vite App' },
      }
      const valid = validateOutput(data)
      if (!valid) throw new Error(`Expected valid output: ${formatErrors(validateOutput.errors)}`)
    })

    it('accepts a valid error output with error message', () => {
      const data = {
        id: 'eval-2',
        expression: "throw new Error('x')",
        timestamp: 1725541000456,
        error: 'x',
        duration: 1.23,
        target: { id: 'target-1', url: 'http://localhost:5173/', title: 'Vite App' },
      }
      const valid = validateOutput(data)
      if (!valid) throw new Error(`Expected valid output: ${formatErrors(validateOutput.errors)}`)
    })

    it('rejects when both result and error are missing', () => {
      const data = {
        id: 'eval-3',
        expression: '1',
        timestamp: 1,
        duration: 0.1,
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data as any)
      expect(valid).toBe(false)
      // oneOf should fail, indicate that one of result or error is required
      expect(formatErrors(validateOutput.errors)).toContain('oneOf')
    })

    it('rejects when both result and error are present (oneOf)', () => {
      const data = {
        id: 'eval-4',
        expression: '1',
        timestamp: 1,
        result: 1,
        error: 'oops',
        duration: 0.1,
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data as any)
      expect(valid).toBe(false)
      expect(formatErrors(validateOutput.errors)).toContain('oneOf')
    })

    it('rejects invalid consoleOutput items', () => {
      const data = {
        id: 'eval-5',
        expression: '1',
        timestamp: 1,
        result: 1,
        consoleOutput: [
          { level: 'log', message: 'ok', timestamp: 1 },
          { level: 'warn', message: 'missing ts' } as any, // missing timestamp
        ],
        duration: 0.1,
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateOutput.errors)).toContain('required')
    })

    it('rejects non-number duration', () => {
      const data = {
        id: 'eval-6',
        expression: '1',
        timestamp: 1,
        result: 1,
        duration: 'fast',
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data as any)
      expect(valid).toBe(false)
      expect(formatErrors(validateOutput.errors)).toContain('number')
    })

    it('rejects non-integer timestamp', () => {
      const data = {
        id: 'eval-7',
        expression: '1',
        timestamp: 1.5,
        result: 1,
        duration: 0.1,
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateOutput.errors)).toContain('integer')
    })
  })
})
