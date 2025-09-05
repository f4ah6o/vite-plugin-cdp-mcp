import { describe, it, expect } from 'vitest'
import Ajv, { type ErrorObject } from 'ajv'
import tools from '../../specs/001-docs-plan-md/contracts/mcp-tools.json'

const ajv = new Ajv({ allErrors: true, strict: false })

const cdpNetworkTail = (tools as any).tools['cdp.network.tail']
const inputSchema = cdpNetworkTail.inputSchema
const outputSchema = cdpNetworkTail.outputSchema

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return ''
  return errors.map((e) => `${e.instancePath} ${e.message}`).join('; ')
}

describe('T005 Contract: cdp.network.tail schemas', () => {
  describe('Input schema validation (count, method, status, domain)', () => {
    const validateInput = ajv.compile(inputSchema)

    it('accepts an empty object (all optional with defaults)', () => {
      const data = {}
      const valid = validateInput(data)
      if (!valid) {
        throw new Error(`Expected valid input: ${formatErrors(validateInput.errors)}`)
      }
    })

    it('accepts valid values for count, method, status, domain', () => {
      const data = { count: 50, method: 'GET', status: 200, domain: 'example.com' }
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
      const data = { count: 101 }
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

    it('rejects invalid method value', () => {
      const data = { method: 'FETCH' }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('enum')
    })

    it('rejects status below 100', () => {
      const data = { status: 99 }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('minimum')
    })

    it('rejects status above 599', () => {
      const data = { status: 600 }
      const valid = validateInput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateInput.errors)).toContain('maximum')
    })

    it('rejects non-integer status', () => {
      const data = { status: 200.5 }
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

  describe('Output schema validation (requests[], totalCount, target)', () => {
    const validateOutput = ajv.compile(outputSchema)

    it('accepts a valid output object', () => {
      const data = {
        requests: [
          {
            requestId: 'req-1',
            url: 'https://example.com/api',
            method: 'GET',
            status: 200,
            origin: 'https://example.com',
            timestamp: 1725540000123,
            duration: 12.34,
            failed: false,
            requestHeaders: { accept: 'application/json' },
            responseHeaders: { 'content-type': 'application/json' },
          },
          {
            requestId: 'req-2',
            url: 'https://api.example.com/users',
            method: 'POST',
            origin: 'https://api.example.com',
            timestamp: 1725540000456,
            failed: true,
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
      const dataMissingRequests = {
        totalCount: 1,
        target: { id: 'id', url: 'x', title: 't' },
      }
      expect(validateOutput(dataMissingRequests)).toBe(false)

      const dataMissingTotal = {
        requests: [],
        target: { id: 'id', url: 'x', title: 't' },
      }
      expect(validateOutput(dataMissingTotal)).toBe(false)

      const dataMissingTarget = { requests: [], totalCount: 0 }
      expect(validateOutput(dataMissingTarget)).toBe(false)
    })

    it('rejects requests with invalid method', () => {
      const data = {
        requests: [
          {
            requestId: 'req-1',
            url: 'https://x',
            method: 'FETCH', // invalid per enum
            origin: 'https://x',
            timestamp: 1,
            failed: false,
          },
        ],
        totalCount: 1,
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateOutput.errors)).toContain('enum')
    })

    it('rejects requests missing required fields', () => {
      const data = {
        requests: [
          {
            requestId: 'req-1',
            url: 'https://x',
            method: 'GET',
            // origin missing
            timestamp: 1,
            failed: false,
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
        requests: [],
        totalCount: 1.5,
        target: { id: 'id', url: 'x', title: 't' },
      }
      const valid = validateOutput(data)
      expect(valid).toBe(false)
      expect(formatErrors(validateOutput.errors)).toContain('integer')
    })
  })
})
