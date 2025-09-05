import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import type { ViteDevServer } from 'vite'
import { createServer } from 'vite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// NOTE: This test targets the MCP server mounted by the Vite plugin
// that will live at `src/lib/vite-plugin-cdp-mcp.ts`.
// The implementation may not exist yet; these tests are intended to
// drive development (they will fail until implemented).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - module will be implemented in later tasks
import cdpMcpPlugin from '../../src/lib/vite-plugin-cdp-mcp'

let server: ViteDevServer | undefined
let baseURL: string | undefined

async function startDevServer() {
  // Start a Vite dev server programmatically with our plugin mounted.
  server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      // Initialize with default options; implementation should mount at /mcp
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (cdpMcpPlugin as any)(),
    ],
  })
  await server.listen()

  const addr = server.httpServer?.address()
  if (!addr || typeof addr === 'string') throw new Error('Failed to determine dev server address')
  baseURL = `http://127.0.0.1:${addr.port}`
  return baseURL
}

async function stopDevServer() {
  if (server) {
    await server.close()
    server = undefined
  }
}

beforeAll(async () => {
  await startDevServer()
}, 30_000)

afterAll(async () => {
  await stopDevServer()
})

describe('T009 Integration: MCP server via Vite /mcp', () => {
  it('mounts MCP endpoint at /mcp and completes initialize handshake', async () => {
    if (!baseURL) throw new Error('Dev server not started')
    const url = new URL('/mcp', baseURL)

    const client = new Client({ name: 'integration-test', version: '0.0.0' })
    const transport = new StreamableHTTPClientTransport(url)

    // Expect connect to succeed (server must respond to initialize)
    await expect(client.connect(transport)).resolves.toBeUndefined()

    // Server should report capabilities; at minimum tools capability is expected
    const caps = client.getServerCapabilities()
    expect(caps).toBeDefined()
    expect(caps?.tools).toBeDefined()

    await client.close()
  })

  it('exposes registered tools via discovery', async () => {
    if (!baseURL) throw new Error('Dev server not started')
    const url = new URL('/mcp', baseURL)

    const client = new Client({ name: 'integration-test', version: '0.0.0' })
    const transport = new StreamableHTTPClientTransport(url)
    await client.connect(transport)

    const tools = await client.listTools()
    // Expect at least the three core tools to be present once implemented
    const names = tools.tools.map((t) => t.name)
    expect(Array.isArray(names)).toBe(true)
    expect(names.length).toBeGreaterThan(0)
    expect(names).toEqual(
      expect.arrayContaining(['cdp.console.tail', 'cdp.network.tail', 'cdp.runtime.eval']),
    )

    await client.close()
  })

  it('supports request/response lifecycle over HTTP transport (tool call)', async () => {
    if (!baseURL) throw new Error('Dev server not started')
    const url = new URL('/mcp', baseURL)

    const client = new Client({ name: 'integration-test', version: '0.0.0' })
    const transport = new StreamableHTTPClientTransport(url)
    await client.connect(transport)

    // Call a lightweight tool that should be implemented by the server
    // Here we target runtime.eval with a trivial expression
    const result = await client.callTool({
      name: 'cdp.runtime.eval',
      arguments: { expression: '1 + 1' },
    })

    // The exact shape will depend on implementation, but we expect a text content response
    expect(result).toBeDefined()
    expect(result.content).toBeDefined()
    const text = result.content.find((c: any) => c.type === 'text') as
      | { type: string; text: string }
      | undefined
    expect(text).toBeDefined()
    expect(text?.text).toMatch(/2/) // should contain evaluation result

    await client.close()
  })
})
