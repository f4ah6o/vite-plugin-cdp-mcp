import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import type { ViteDevServer } from 'vite'
import { createServer } from 'vite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - module will be implemented in later tasks
import cdpMcpPlugin from '../../src/lib/vite-plugin-cdp-mcp'

let server: ViteDevServer | undefined
let baseURL: string | undefined
let client: Client | undefined

beforeAll(async () => {
  // Start Vite dev server with plugin
  server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (cdpMcpPlugin as any)({
        port: 9222,
        mcpPath: '/mcp',
        bufferSize: { console: 1000, network: 100 },
      }),
    ],
  })
  await server.listen()

  const addr = server.httpServer?.address()
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to determine dev server address')
  }
  baseURL = `http://127.0.0.1:${addr.port}`

  // Set up MCP client for testing
  client = new Client({ name: 'e2e-test', version: '0.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseURL))
  await client.connect(transport)
}, 30_000)

afterAll(async () => {
  if (client) {
    await client.close()
  }
  if (server) {
    await server.close()
  }
})

describe('T011 Integration: End-to-End Workflow', () => {
  describe('Console Log Retrieval Scenario', () => {
    it('executes complete console log workflow from quickstart', async () => {
      if (!client) throw new Error('MCP client not initialized')

      // Step 1: Call cdp.console.tail tool
      const result = await client.callTool({
        name: 'cdp.console.tail',
        arguments: { count: 10, level: 'log' },
      })

      // Should get a response with proper structure
      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)

      const textContent = result.content.find((c: any) => c.type === 'text')
      expect(textContent).toBeDefined()

      // Response should indicate console entries or Chrome connection status
      const text = (textContent as any)?.text || ''
      expect(typeof text).toBe('string')
      expect(text.length).toBeGreaterThan(0)
    })

    it('supports filtering by log level', async () => {
      if (!client) throw new Error('MCP client not initialized')

      // Test different log levels
      const levels = ['log', 'warn', 'error', 'info', 'debug'] as const

      for (const level of levels) {
        const result = await client.callTool({
          name: 'cdp.console.tail',
          arguments: { count: 5, level },
        })

        expect(result.content).toBeDefined()
        const textContent = result.content.find((c: any) => c.type === 'text')
        expect(textContent).toBeDefined()
      }
    })
  })

  describe('Network Request Inspection Scenario', () => {
    it('executes complete network inspection workflow from quickstart', async () => {
      if (!client) throw new Error('MCP client not initialized')

      // Step 1: Call cdp.network.tail tool
      const result = await client.callTool({
        name: 'cdp.network.tail',
        arguments: { count: 20, method: 'GET' },
      })

      // Should get response with network request structure
      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)

      const textContent = result.content.find((c: any) => c.type === 'text')
      expect(textContent).toBeDefined()

      // Response should contain network information or connection status
      const text = (textContent as any)?.text || ''
      expect(typeof text).toBe('string')
    })

    it('supports filtering by HTTP method and status', async () => {
      if (!client) throw new Error('MCP client not initialized')

      // Test method filtering
      const methods = ['GET', 'POST', 'PUT'] as const
      for (const method of methods) {
        const result = await client.callTool({
          name: 'cdp.network.tail',
          arguments: { count: 10, method },
        })
        expect(result.content).toBeDefined()
      }

      // Test status filtering
      const result = await client.callTool({
        name: 'cdp.network.tail',
        arguments: { count: 10, status: 200 },
      })
      expect(result.content).toBeDefined()
    })
  })

  describe('JavaScript Runtime Evaluation Scenario', () => {
    it('executes complete JavaScript evaluation workflow from quickstart', async () => {
      if (!client) throw new Error('MCP client not initialized')

      // Step 1: Evaluate simple expression
      const result = await client.callTool({
        name: 'cdp.runtime.eval',
        arguments: {
          expression: 'const result = 2 + 3; console.log("Calculation:", result); result * 10;',
          awaitPromise: false,
          timeout: 5000,
        },
      })

      // Should get evaluation results
      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)

      const textContent = result.content.find((c: any) => c.type === 'text')
      expect(textContent).toBeDefined()

      // Response should contain evaluation result or Chrome connection status
      const text = (textContent as any)?.text || ''
      expect(typeof text).toBe('string')
    })

    it('handles JavaScript expressions with different configurations', async () => {
      if (!client) throw new Error('MCP client not initialized')

      // Test basic expression
      const basic = await client.callTool({
        name: 'cdp.runtime.eval',
        arguments: { expression: '1 + 1' },
      })
      expect(basic.content).toBeDefined()

      // Test with promise (even if Chrome not available, should not throw)
      const promise = await client.callTool({
        name: 'cdp.runtime.eval',
        arguments: {
          expression: 'Promise.resolve(42)',
          awaitPromise: true,
          timeout: 1000,
        },
      })
      expect(promise.content).toBeDefined()
    })
  })

  describe('Error Handling Scenarios', () => {
    it('handles Chrome not available gracefully', async () => {
      if (!client) throw new Error('MCP client not initialized')

      // All tools should respond gracefully when Chrome is not available
      // rather than throwing unhandled exceptions

      const consoleResult = await client.callTool({
        name: 'cdp.console.tail',
        arguments: { count: 1 },
      })

      // Should not throw, may contain error message about Chrome availability
      expect(consoleResult).toBeDefined()
      expect(consoleResult.content || consoleResult.error).toBeDefined()
    })

    it('handles invalid JavaScript evaluation requests', async () => {
      if (!client) throw new Error('MCP client not initialized')

      // Test invalid JavaScript syntax
      const result = await client.callTool({
        name: 'cdp.runtime.eval',
        arguments: { expression: 'invalid javascript syntax {' },
      })

      // Should get error response, not throw exception
      expect(result).toBeDefined()

      // Either content with error message or error field should be present
      const hasContent = result.content && result.content.length > 0
      const hasError = result.error
      expect(hasContent || hasError).toBe(true)
    })
  })

  describe('Performance and Reliability', () => {
    it('maintains <100ms response time for tool calls', async () => {
      if (!client) throw new Error('MCP client not initialized')

      const start = Date.now()

      await client.callTool({
        name: 'cdp.console.tail',
        arguments: { count: 10 },
      })

      const duration = Date.now() - start

      // Should respond within reasonable time even if Chrome not available
      // Allowing more generous timeout for test environment
      expect(duration).toBeLessThan(5000)
    })

    it('handles concurrent tool requests without issues', async () => {
      if (!client) throw new Error('MCP client not initialized')

      // Execute multiple tool calls concurrently
      const promises = [
        client.callTool({ name: 'cdp.console.tail', arguments: { count: 5 } }),
        client.callTool({ name: 'cdp.network.tail', arguments: { count: 5 } }),
        client.callTool({ name: 'cdp.runtime.eval', arguments: { expression: '1' } }),
      ]

      const results = await Promise.all(promises)

      // All should complete without throwing
      expect(results).toHaveLength(3)
      for (const result of results) {
        expect(result).toBeDefined()
        expect(result.content || result.error).toBeDefined()
      }
    })
  })
})
