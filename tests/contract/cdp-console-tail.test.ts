import { describe, it, expect } from 'vitest'
import Ajv, { type ErrorObject } from 'ajv'
import tools from '../../specs/001-docs-plan-md/contracts/mcp-tools.json'

const ajv = new Ajv({ allErrors: true, strict: false })

const cdpConsoleTail = (tools as any).tools['cdp.console.tail']
const inputSchema = cdpConsoleTail.inputSchema
const outputSchema = cdpConsoleTail.outputSchema

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return ''
  return errors.map((e) => `${e.instancePath} ${e.message}`).join('; ')
}

describe('T004 Contract: cdp.console.tail schemas', () => {
  describe('Input schema validation (count, level, since)', () => {
    const validateInput = ajv.compile(inputSchema)

    it('accepts an empty object (all optional with defaults)', () => {
      const data = {}
      const valid = validateInput(data)
      if (!valid) {
        throw new Error(`Expected valid input: ${formatErrors(validateInput.errors)}`)
      }
    })

    it('accepts valid values for count, level, since', () => {
      const data = { count: 100, level: 'warn', since: 1725540000000 }
      const valid = validateInput(data)
      if (!valid) {
        throw new Error(`Expected valid input: ${formatErrors(validateInput.errors)}`)
      }
    })

    it('rejects count below minimum', () => {
      const data = { count: 0 }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('minimum')
    })

    it('rejects count above maximum', () => {
      const data = { count: 1001 }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('maximum')
    })

    it('rejects non-integer count', () => {
      const data = { count: 10.5 }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('integer')
    })

    it('rejects invalid level value', () => {
      const data = { level: 'trace' }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('enum')
    })

    it('rejects non-integer since', () => {
      const data = { since: 123.45 }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('integer')
    })

    it('rejects additional properties', () => {
      const data = { foo: 'bar' }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('additionalProperties')
    })
  })

  describe('Output schema validation (entries[], totalCount, target)', () => {
    const validateOutput = ajv.compile(outputSchema)

    it('accepts a valid output object', () => {
      const data = {
        entries: [
          {
            level: 'info',
            timestamp: 1725540000123,
            message: 'App started',
            source: 'main.ts:10',
          },
          {
            level: 'error',
            timestamp: 1725540000456,
            message: 'Unexpected error',
            source: 'utils.ts:42',
            stackTrace: 'Error: oops\n  at fn (utils.ts:42)\n',
          },
        ],
        totalCount: 2,
        target: { id: 'target-1', url: 'http://localhost:5173/', title: 'Vite App' },
      }
      const valid = validateOutput(data)
      if (!valid) {
        throw new Error(`Expected valid output: ${formatErrors(validateOutput.errors)}`)
      }
    })

    it('rejects when required top-level field is missing', () => {
      const dataMissingEntries = {
        totalCount: 1,
        target: { id: 'id', url: 'x', title: 't' },
      }
      expect(validateOutput(dataMissingEntries)).toBe(false)

      const dataMissingTotal = {
        entries: [],
        target: { id: 'id', url: 'x', title: 't' },
      }
      expect(validateOutput(dataMissingTotal)).toBe(false)

      const dataMissingTarget = { entries: [], totalCount: 0 }
      expect(validateOutput(dataMissingTarget)).toBe(false)
    })

    it('rejects entries with invalid level', () => {
      const data = {
        entries: [
          {
            level: 'trace', // invalid per enum
            timestamp: 1,
            message: 'm',
            source: 's:1',
          },
        ],
        totalCount: 1,
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateOutput.errors)).toContain('enum')
    })

    it('rejects entries missing required fields', () => {
      const data = {
        entries: [
          {
            level: 'log',
            timestamp: 1,
            message: 'no source field here',
            // source missing
          } as any,
        ],
        totalCount: 1,
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateOutput.errors)).toContain('required')
    })

    it('rejects non-integer totalCount', () => {
      const data = {
        entries: [],
        totalCount: 1.5,
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateOutput.errors)).toContain('integer')
    })
  })
})
