import { describe, it, expect } from 'vitest'
import Ajv, { type ErrorObject } from 'ajv'
import tools from '../../specs/001-docs-plan-md/contracts/mcp-tools.json'

const ajv = new Ajv({ allErrors: true, strict: false })

const healthResource = (tools as any).resources['/mcp/health']
const responseSchema = healthResource.responseSchema

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return ''
  return errors.map((e) => `${e.instancePath} [${e.keyword}] ${e.message}`).join('; ')
}

describe('T007 Contract: /mcp/health endpoint schema', () => {
  const validate = ajv.compile(responseSchema)

  describe('Accepts different health states', () => {
    it('accepts healthy state', () => {
      const data = {
        status: 'healthy',
        chrome: { connected: true, version: '120.0.0', targets: 3 },
        plugin: { version: '0.1.0', uptime: 1234 },
      }
      const valid = validate(data)
      if (!valid) throw new Error(`Expected valid health payload: ${formatErrors(validate.errors)}`)
    })

    it('accepts degraded state', () => {
      const data = {
        status: 'degraded',
        chrome: { connected: true, version: '121.0.1', targets: 0 },
        plugin: { version: '0.1.1', uptime: 5678 },
      }
      const valid = validate(data)
      if (!valid)
        throw new Error(`Expected valid degraded payload: ${formatErrors(validate.errors)}`)
    })

    it('accepts unhealthy state', () => {
      const data = {
        status: 'unhealthy',
        chrome: { connected: false },
        plugin: { version: '0.1.2', uptime: 1 },
      }
      const valid = validate(data)
      if (!valid)
        throw new Error(`Expected valid unhealthy payload: ${formatErrors(validate.errors)}`)
    })
  })

  describe('Rejects invalid or incomplete payloads', () => {
    it('rejects invalid status enum', () => {
      const data = {
        status: 'ok',
        chrome: { connected: true },
        plugin: { version: '0.1.0', uptime: 100 },
      }
      const valid = validate(data as any)
      expect(valid).toBe(false)
      expect(formatErrors(validate.errors)).toContain('enum')
    })

    it('rejects when required top-level fields are missing', () => {
      const missingStatus = {
        chrome: { connected: true },
        plugin: { version: '0.1.0', uptime: 100 },
      }
      expect(validate(missingStatus as any)).toBe(false)

      const missingChrome = {
        status: 'healthy',
        plugin: { version: '0.1.0', uptime: 100 },
      }
      expect(validate(missingChrome as any)).toBe(false)

      const missingPlugin = {
        status: 'healthy',
        chrome: { connected: true },
      }
      expect(validate(missingPlugin as any)).toBe(false)
    })

    it('rejects chrome object missing required connected field', () => {
      const data = {
        status: 'healthy',
        chrome: { version: '120.0.0', targets: 2 }, // missing connected
        plugin: { version: '0.1.0', uptime: 10 },
      }
      const valid = validate(data as any)
      expect(valid).toBe(false)
      expect(formatErrors(validate.errors)).toContain('required')
    })

    it('rejects plugin object missing required fields', () => {
      const missingVersion = {
        status: 'healthy',
        chrome: { connected: true },
        plugin: { uptime: 10 },
      }
      expect(validate(missingVersion as any)).toBe(false)

      const missingUptime = {
        status: 'healthy',
        chrome: { connected: true },
        plugin: { version: '0.1.0' },
      }
      expect(validate(missingUptime as any)).toBe(false)
    })

    it('rejects invalid field types', () => {
      const nonIntegerUptime = {
        status: 'healthy',
        chrome: { connected: true },
        plugin: { version: '0.1.0', uptime: 12.34 }, // must be integer
      }
      expect(validate(nonIntegerUptime as any)).toBe(false)
      expect(formatErrors(validate.errors)).toContain('integer')

      const nonIntegerTargets = {
        status: 'healthy',
        chrome: { connected: true, targets: '3' }, // must be integer if provided
        plugin: { version: '0.1.0', uptime: 10 },
      }
      expect(validate(nonIntegerTargets as any)).toBe(false)
      expect(formatErrors(validate.errors)).toContain('integer')

      const nonStringVersion = {
        status: 'healthy',
        chrome: { connected: true },
        plugin: { version: 123, uptime: 10 }, // must be string
      }
      expect(validate(nonStringVersion as any)).toBe(false)
      expect(formatErrors(validate.errors)).toContain('string')
    })
  })
})
