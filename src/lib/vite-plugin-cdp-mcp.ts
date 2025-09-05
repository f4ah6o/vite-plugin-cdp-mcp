import type { Plugin, ViteDevServer } from 'vite'
// HTTP transport not used directly in plugin - handled via middleware
import { MCPServer, MCPServerConfig } from '../services/mcp-server.js'
import {
  validatePluginConfig,
  type PluginConfig as ValidatorPluginConfig,
} from './config-validator.js'
import {
  ensureDevelopmentMode,
  validateLocalCDP,
  warnRemoteDebuggingRisks,
} from './security-validator.js'

export interface PluginConfig extends ValidatorPluginConfig {}

export default function cdpMcpPlugin(userConfig: PluginConfig = {}): Plugin {
  const { config, warnings } = validatePluginConfig(userConfig)
  for (const w of warnings) console.warn(`vite-plugin-cdp-mcp: ${w}`)
  let mcpServer: MCPServer | null = null
  let isProduction = false

  return {
    name: 'vite-plugin-cdp-mcp',

    configResolved(resolvedConfig) {
      isProduction = resolvedConfig.command === 'build'
    },

    configureServer(server: ViteDevServer) {
      // Only run in development mode
      if (isProduction) {
        console.log('📦 CDP-MCP plugin: Skipping in production build')
        return
      }

      console.log('🔧 CDP-MCP plugin: Configuring development server')

      // Enforce development-only and localhost:9222 CDP
      try {
        ensureDevelopmentMode({ isProduction })
        validateLocalCDP({ host: 'localhost', port: config.port })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`Security policy violation: ${msg}`)
        throw e
      }

      // Warn prominently about remote debugging risks
      warnRemoteDebuggingRisks()

      // Initialize MCP server
      const mcpConfig: MCPServerConfig = {
        name: 'vite-plugin-cdp-mcp',
        version: '0.1.0',
        cdp: {
          port: config.port,
          host: 'localhost',
        },
        buffers: {
          console: config.bufferSize.console,
          network: config.bufferSize.network,
        },
      }

      mcpServer = new MCPServer(mcpConfig)

      // Mount MCP server at specified path
      server.middlewares.use(config.mcpPath, async (req, res, next) => {
        try {
          if (!mcpServer) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'MCP server not initialized' }))
            return
          }

          // Handle HTTP requests for MCP server
          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })

            req.on('end', async () => {
              try {
                const request = JSON.parse(body)
                const response = await mcpServer.handleRequest(request)

                res.setHeader('Content-Type', 'application/json')
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

                res.end(JSON.stringify(response))
              } catch (error) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(
                  JSON.stringify({
                    error: 'Internal server error',
                    details: error instanceof Error ? error.message : 'Unknown error',
                  }),
                )
              }
            })
          } else if (req.method === 'OPTIONS') {
            // Handle CORS preflight
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
            res.statusCode = 200
            res.end()
          } else if (req.method === 'GET') {
            // Return server info for GET requests
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(
              JSON.stringify({
                name: 'vite-plugin-cdp-mcp',
                version: '0.1.0',
                status: 'running',
                endpoints: {
                  mcp: config.mcpPath,
                  health: `${config.mcpPath}/health`,
                },
              }),
            )
          } else {
            next()
          }
        } catch (error) {
          console.error('MCP middleware error:', error)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      })

      // Initialize MCP server when dev server starts
      const originalListen = server.listen
      server.listen = function (...args: any[]) {
        const result = originalListen.apply(this, args)

        // Start MCP server after Vite server is listening
        if (result && typeof result.then === 'function') {
          result.then(async () => {
            if (mcpServer) {
              try {
                await mcpServer.initialize()
                console.log(`🎯 MCP server mounted at ${config.mcpPath}`)
                console.log(`🔍 Chrome DevTools connection: localhost:${config.port}`)
              } catch (error) {
                console.warn('⚠️ Failed to initialize MCP server:', error)
              }
            }
          })
        } else {
          // Synchronous listen
          setTimeout(async () => {
            if (mcpServer) {
              try {
                await mcpServer.initialize()
                console.log(`🎯 MCP server mounted at ${config.mcpPath}`)
                console.log(`🔍 Chrome DevTools connection: localhost:${config.port}`)
              } catch (error) {
                console.warn('⚠️ Failed to initialize MCP server:', error)
              }
            }
          }, 100)
        }

        return result
      }

      // Cleanup when server closes
      const originalClose = server.close
      server.close = async function (...args: any[]) {
        if (mcpServer) {
          try {
            await mcpServer.shutdown()
            mcpServer = null
          } catch (error) {
            console.warn('Error shutting down MCP server:', error)
          }
        }

        return originalClose.apply(this, args)
      }
    },

    buildStart() {
      if (isProduction) {
        // In production builds, this plugin should be a no-op
        console.log('📦 CDP-MCP plugin: No-op in production build')
      }
    },

    buildEnd() {
      // Cleanup if needed
      if (mcpServer) {
        mcpServer.shutdown().catch(console.warn)
        mcpServer = null
      }
    },
  }
}
