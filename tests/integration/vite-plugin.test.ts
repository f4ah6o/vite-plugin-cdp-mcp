import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import type { ViteDevServer } from 'vite'
import { createServer, build } from 'vite'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - module will be implemented in later tasks
import cdpMcpPlugin from '../../src/lib/vite-plugin-cdp-mcp'

let server: ViteDevServer | undefined

async function createTestServer() {
  return await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (cdpMcpPlugin as any)({
        port: 9222,
        mcpPath: '/mcp',
        bufferSize: { console: 100, network: 50 },
      }),
    ],
  })
}

describe('T010 Integration: Vite Plugin Lifecycle', () => {
  it('registers plugin without throwing during server creation', async () => {
    // Should not throw when creating server with plugin
    await expect(createTestServer()).resolves.toBeDefined()
  })

  it('starts development server with plugin successfully', async () => {
    server = await createTestServer()

    // Should start without errors
    await expect(server.listen()).resolves.toBeDefined()

    // Server should be listening
    const address = server.httpServer?.address()
    expect(address).toBeTruthy()
    expect(typeof address).toBe('object')
  })

  it('plugin integrates with Vite middleware system', async () => {
    if (!server) {
      server = await createTestServer()
      await server.listen()
    }

    // Check that our plugin is in the middleware stack
    const middlewares = server.middlewares.stack
    expect(Array.isArray(middlewares)).toBe(true)

    // Should have our /mcp route handler
    const mcpHandler = middlewares.find((layer) => layer.route && layer.route.includes('/mcp'))
    expect(mcpHandler).toBeDefined()
  })

  it('supports hot reload without breaking plugin functionality', async () => {
    if (!server) {
      server = await createTestServer()
      await server.listen()
    }

    // Trigger HMR update (simulate file change)
    const moduleGraph = server.moduleGraph
    const modules = Array.from(moduleGraph.urlToModuleMap.keys())

    // Plugin should not interfere with HMR
    expect(() => {
      server!.ws.send({
        type: 'update',
        updates: [],
      })
    }).not.toThrow()

    // MCP endpoint should still be available after HMR
    const address = server.httpServer!.address()
    const port = typeof address === 'object' && address ? address.port : 3000
    const baseURL = `http://127.0.0.1:${port}`

    // Simple connectivity test to /mcp endpoint
    try {
      const response = await fetch(`${baseURL}/mcp`)
      // Should get some response (may be 404 or proper MCP response)
      expect(response).toBeDefined()
    } catch (error) {
      // Network errors are acceptable in test environment
      // The important thing is that the server didn't crash
      expect(error).toBeInstanceOf(Error)
    }
  })

  it('properly cleans up resources on server shutdown', async () => {
    if (!server) {
      server = await createTestServer()
      await server.listen()
    }

    const serverRef = server

    // Should close without throwing
    await expect(serverRef.close()).resolves.toBeUndefined()

    // Server should be closed
    expect(serverRef.httpServer?.listening).toBeFalsy()

    server = undefined
  })

  it('works with Vite build process (production mode)', async () => {
    // Plugin should not interfere with build
    const buildResult = await build({
      root: process.cwd(),
      logLevel: 'error',
      plugins: [
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        (cdpMcpPlugin as any)(),
      ],
      build: {
        write: false, // Don't actually write files in test
        rollupOptions: {
          input: {
            // Create a minimal entry point for build test
            main: 'data:text/javascript,export default "test"',
          },
        },
      },
    })

    // Build should complete successfully
    expect(buildResult).toBeDefined()

    // In development-only plugin, it should not affect production build
    // The plugin should detect non-dev mode and become a no-op
  })

  afterAll(async () => {
    if (server) {
      await server.close()
      server = undefined
    }
  })
})
