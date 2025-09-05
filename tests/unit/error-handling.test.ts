import { describe, it, expect } from 'vitest'

import { MCPTools } from '../../src/services/mcp-tools'
import { BufferManager } from '../../src/services/buffer-manager'
import { CDPClient } from '../../src/services/cdp-client'
import { assertExpressionSafe } from '../../src/lib/security-validator'

// Minimal fake CDP client for MCPTools tests
class FakeCDPClient {
  getCurrentTarget() {
    return null
  }
  onConsoleMessage(_cb: (msg: any) => void) {
    // no-op
  }
  onNetworkRequest(_cb: (evt: any) => void) {
    // no-op
  }
}

describe('T027 Unit: Error handling', () => {
  describe('MCPTools: no browser target errors', () => {
    const bufferManager = new BufferManager({ console: 1000, network: 100 })

    const tools = new MCPTools(new FakeCDPClient() as unknown as CDPClient, bufferManager)

    it('handleConsoleTail throws when no target', async () => {
      await expect(tools.handleConsoleTail({ count: 10 })).rejects.toThrow(
        /No browser target available/,
      )
    })

    it('handleNetworkTail throws when no target', async () => {
      await expect(tools.handleNetworkTail({ count: 5 })).rejects.toThrow(
        /No browser target available/,
      )
    })

    it('handleRuntimeEval throws when no target', async () => {
      await expect(
        tools.handleRuntimeEval({ expression: '1+1', timeout: 500 }),
      ).rejects.toThrow(/No browser target available/)
    })
  })

  describe('CDPClient: not connected errors', () => {
    const cdp = new CDPClient({ host: 'localhost', port: 9222 })

    it('evaluateExpression throws when client not connected', async () => {
      await expect(cdp.evaluateExpression('1+1', 100)).rejects.toThrow(/CDP client not connected/)
    })

    it('onConsoleMessage throws when client not connected', () => {
      expect(() => cdp.onConsoleMessage(() => {})).toThrow(/CDP client not connected/)
    })

    it('onNetworkRequest throws when client not connected', () => {
      expect(() => cdp.onNetworkRequest(() => {})).toThrow(/CDP client not connected/)
    })
  })

  describe('Security validator: destructive expressions blocked', () => {
    it('blocks setting location', () => {
      expect(() => assertExpressionSafe("location = 'http://example.com'"))
        .toThrow(/security violation/)
    })

    it('blocks using fetch', () => {
      expect(() => assertExpressionSafe("fetch('http://example.com')"))
        .toThrow(/security violation/)
    })
  })
})

