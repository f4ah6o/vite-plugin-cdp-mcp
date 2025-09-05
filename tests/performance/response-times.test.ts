import { describe, it, expect, beforeEach } from 'vitest'
import { BufferManager } from '../../src/services/buffer-manager.js'
import { MCPTools } from '../../src/services/mcp-tools.js'
import { createConsoleEntry, toBuffered } from '../../src/models/console-entry.js'
import { createNetworkRequest, toCompleted } from '../../src/models/network-request.js'
import type { BrowserTarget } from '../../src/models/browser-target.js'

// Stub CDP client for performance testing
class StubCDPClient {
  private target: BrowserTarget = {
    id: 'target-1',
    url: 'http://localhost:5173',
    title: 'Test Target',
    type: 'page',
    attached: true,
    canAttach: true,
    lastActivity: Date.now()
  }

  onConsoleMessage(_callback: (message: any) => void): void {
    // No-op for testing
  }

  onNetworkRequest(_callback: (request: any) => void): void {
    // No-op for testing
  }

  async evaluateExpression(expression: string, _timeout?: number): Promise<any> {
    // Fast stub evaluation
    return {
      result: { value: eval(expression) },
      exceptionDetails: null
    }
  }

  getCurrentTarget(): BrowserTarget | null {
    return this.target
  }

  async connect(): Promise<void> {
    // Fast stub connection
  }

  async disconnect(): Promise<void> {
    // No-op
  }

  isConnected(): boolean {
    return true
  }
}

describe('T028 Performance: Response Times', () => {
  let bufferManager: BufferManager
  let mcpTools: MCPTools
  let stubCdp: StubCDPClient

  beforeEach(() => {
    bufferManager = new BufferManager({
      console: 1000,
      network: 100
    })
    stubCdp = new StubCDPClient()
    mcpTools = new MCPTools(stubCdp as any, bufferManager)
  })

  describe('MCP Tool Response Times', () => {
    it('cdp.console.tail responds within 100ms under normal conditions', async () => {
      // Pre-populate buffer with some entries
      for (let i = 0; i < 50; i++) {
        const entry = toBuffered(createConsoleEntry({
          level: 'log',
          timestamp: Date.now() - i * 1000,
          message: `Test message ${i}`,
          source: `test.js:${i}:1`
        }))
        bufferManager.addConsoleEntry(entry)
      }

      const start = performance.now()
      
      const result = await mcpTools.callTool('cdp.console.tail', {
        count: 20,
        level: 'log'
      })
      
      const duration = performance.now() - start
      
      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(duration).toBeLessThan(100) // <100ms requirement
    })

    it('cdp.network.tail responds within 100ms under normal conditions', async () => {
      // Pre-populate network buffer
      for (let i = 0; i < 30; i++) {
        const request = toCompleted(createNetworkRequest({
          requestId: `req-${i}`,
          url: `https://api.example.com/endpoint-${i}`,
          method: 'GET',
          status: 200,
          origin: 'http://localhost:5173',
          timestamp: Date.now() - i * 500,
          duration: 50 + i,
          requestHeaders: { 'accept': 'application/json' },
          responseHeaders: { 'content-type': 'application/json' },
          failed: false
        }))
        bufferManager.addNetworkRequest(request)
      }

      const start = performance.now()
      
      const result = await mcpTools.callTool('cdp.network.tail', {
        count: 10,
        method: 'GET'
      })
      
      const duration = performance.now() - start
      
      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(duration).toBeLessThan(100) // <100ms requirement
    })

    it('cdp.runtime.eval responds within 100ms for simple expressions', async () => {
      const start = performance.now()
      
      const result = await mcpTools.callTool('cdp.runtime.eval', {
        expression: '2 + 2',
        timeout: 1000
      })
      
      const duration = performance.now() - start
      
      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(duration).toBeLessThan(100) // <100ms requirement
    })
  })

  describe('Buffer Query Performance', () => {
    it('console buffer queries perform well at maximum capacity', async () => {
      // Fill buffer to maximum capacity (1000 entries)
      for (let i = 0; i < 1000; i++) {
        const entry = toBuffered(createConsoleEntry({
          level: i % 5 === 0 ? 'error' : 'log',
          timestamp: Date.now() - i * 100,
          message: `Performance test message ${i}`,
          source: `perf-test.js:${i % 100 + 1}:1`
        }))
        bufferManager.addConsoleEntry(entry)
      }

      const start = performance.now()
      
      // Query with filters (most expensive operation)
      const result = bufferManager.queryConsoleEntries({
        count: 50,
        level: 'error',
        since: Date.now() - 10000
      })
      
      const duration = performance.now() - start
      
      expect(result.entries.length).toBeGreaterThan(0)
      expect(result.totalCount).toBeGreaterThan(0)
      expect(duration).toBeLessThan(100) // Should handle max capacity quickly
    })

    it('network buffer queries perform well at maximum capacity', async () => {
      // Fill network buffer to maximum capacity (100 entries)
      for (let i = 0; i < 100; i++) {
        const request = toCompleted(createNetworkRequest({
          requestId: `perf-req-${i}`,
          url: `https://api.test.com/data/${i}`,
          method: i % 3 === 0 ? 'POST' : 'GET',
          status: i % 10 === 0 ? 500 : 200,
          origin: 'http://localhost:5173',
          timestamp: Date.now() - i * 50,
          duration: 10 + (i % 50),
          requestHeaders: { 'authorization': `Bearer token-${i}` },
          responseHeaders: { 'x-request-id': `${i}` },
          failed: i % 10 === 0
        }))
        bufferManager.addNetworkRequest(request)
      }

      const start = performance.now()
      
      // Complex filtered query
      const result = bufferManager.queryNetworkRequests({
        count: 20,
        method: 'GET',
        status: 200,
        domain: 'api.test.com',
        since: Date.now() - 5000
      })
      
      const duration = performance.now() - start
      
      expect(result.requests.length).toBeGreaterThan(0)
      expect(result.totalCount).toBeGreaterThan(0)
      expect(duration).toBeLessThan(100) // Complex queries should still be fast
    })
  })

  describe('CDP Connection Performance', () => {
    it('connection establishment completes within reasonable time', async () => {
      const cdpClient = new StubCDPClient()
      
      const start = performance.now()
      await cdpClient.connect()
      const duration = performance.now() - start
      
      expect(cdpClient.isConnected()).toBe(true)
      expect(duration).toBeLessThan(100) // Fast stub connection
    })
  })

  describe('Concurrent Request Handling', () => {
    it('handles multiple simultaneous tool calls efficiently', async () => {
      // Pre-populate buffers for realistic concurrent access
      for (let i = 0; i < 100; i++) {
        const entry = toBuffered(createConsoleEntry({
          level: 'info',
          timestamp: Date.now() - i * 10,
          message: `Concurrent test ${i}`,
          source: `concurrent.js:${i}:1`
        }))
        bufferManager.addConsoleEntry(entry)
      }

      const start = performance.now()
      
      // Launch 20 concurrent requests
      const promises = Array.from({ length: 20 }, (_, i) => {
        const toolName = i % 3 === 0 ? 'cdp.console.tail' : 
                         i % 3 === 1 ? 'cdp.network.tail' : 'cdp.runtime.eval'
        
        const args = toolName === 'cdp.console.tail' ? { count: 5 } :
                     toolName === 'cdp.network.tail' ? { count: 3 } :
                     { expression: `${i} * 2` }
        
        return mcpTools.callTool(toolName, args)
      })
      
      const results = await Promise.all(promises)
      const totalDuration = performance.now() - start
      
      expect(results).toHaveLength(20)
      expect(results.every(r => r?.content)).toBe(true)
      expect(totalDuration).toBeLessThan(500) // 20 requests in reasonable time
      
      // Average per request should be well under 100ms
      const avgDuration = totalDuration / 20
      expect(avgDuration).toBeLessThan(50)
    })

    it('maintains performance under rapid sequential calls', async () => {
      const durations: number[] = []
      
      // Make 50 rapid sequential calls
      for (let i = 0; i < 50; i++) {
        const start = performance.now()
        
        const result = await mcpTools.callTool('cdp.runtime.eval', {
          expression: `Math.random() * ${i + 1}`
        })
        
        const duration = performance.now() - start
        durations.push(duration)
        
        expect(result).toBeDefined()
      }
      
      // Each individual call should still be fast
      expect(durations.every(d => d < 100)).toBe(true)
      
      // Average should be well under target
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      expect(avgDuration).toBeLessThan(50)
      
      // No significant degradation over time
      const firstHalf = durations.slice(0, 25)
      const secondHalf = durations.slice(25)
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      
      expect(secondAvg).toBeLessThan(firstAvg * 2) // No more than 2x degradation
    })
  })
})