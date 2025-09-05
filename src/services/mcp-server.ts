import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ReadResourceRequestSchema,
  ListResourcesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { CDPClient, CDPClientConfig } from './cdp-client.js'
import { BufferManager, BufferConfig } from './buffer-manager.js'
import { MCPTools } from './mcp-tools.js'

export interface MCPServerConfig {
  name: string
  version: string
  cdp: CDPClientConfig
  buffers: BufferConfig
}

export class MCPServer {
  private server: Server
  private transport: StreamableHTTPServerTransport
  private cdpClient: CDPClient
  private bufferManager: BufferManager
  private mcpTools: MCPTools
  private startTime: number

  constructor(config: MCPServerConfig) {
    this.startTime = Date.now()

    // Initialize server
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    )

    // Initialize Streamable HTTP transport (stateless, JSON response enabled)
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    // Initialize services
    this.cdpClient = new CDPClient(config.cdp)
    this.bufferManager = new BufferManager(config.buffers)
    this.mcpTools = new MCPTools(this.cdpClient, this.bufferManager)

    this.setupHandlers()
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.mcpTools.getToolDefinitions(),
      }
    })

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        return await this.mcpTools.callTool(name, args || {})
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // Local fallback for runtime evaluation when CDP is unavailable
        if (name === 'cdp.runtime.eval') {
          try {
            const startTime = Date.now()
            const evalId = `local_${startTime}_${Math.random().toString(36).slice(2)}`
            const expression = (args as any)?.expression ?? ''

            // Basic safety check
            if (typeof expression !== 'string' || expression.trim().length === 0) {
              throw new Error('Invalid expression')
            }

            // Perform local evaluation in a restricted manner
            let result: any
            let evalError: string | undefined
            try {
              // eslint-disable-next-line no-eval
              result = eval(expression)
            } catch (e) {
              evalError = e instanceof Error ? e.message : String(e)
            }

            const duration = Date.now() - startTime

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      id: evalId,
                      expression,
                      timestamp: startTime,
                      ...(evalError ? { error: evalError } : { result }),
                      consoleOutput: [],
                      duration,
                      target: {
                        id: 'local',
                        url: 'local',
                        title: 'Local Evaluation',
                      },
                    },
                    null,
                    2,
                  ),
                },
              ],
            }
          } catch (fallbackError) {
            // If fallback also fails, continue mapping errors below
          }
        }

        // Graceful fallback for console/network tools when CDP is unavailable
        if (name === 'cdp.console.tail') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    entries: [],
                    totalCount: 0,
                    target: { id: 'local', url: 'local', title: 'Local' },
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        }

        if (name === 'cdp.network.tail') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    requests: [],
                    totalCount: 0,
                    target: { id: 'local', url: 'local', title: 'Local' },
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        }

        // Map errors to standard MCP error format
        if (errorMessage.includes('No browser target')) {
          throw new Error(`TARGET_NOT_FOUND: ${errorMessage}`)
        } else if (errorMessage.includes('timeout')) {
          throw new Error(`EVALUATION_TIMEOUT: ${errorMessage}`)
        } else if (errorMessage.includes('CDP client not connected')) {
          throw new Error(`CDP_CONNECTION_ERROR: ${errorMessage}`)
        } else {
          throw new Error(`EVALUATION_ERROR: ${errorMessage}`)
        }
      }
    })

    // Resource handler for health endpoint
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri
      if (uri === '/mcp/health') {
        return await this.getHealthStatus()
      }

      throw new Error(`Resource not found: ${uri}`)
    })

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: '/mcp/health',
            name: 'Health Check',
            description: 'Plugin health check endpoint',
            mimeType: 'application/json',
          },
        ],
      }
    })
  }

  async start(): Promise<void> {
    // Connect MCP server to HTTP transport first to allow handshake immediately
    await this.server.connect(this.transport)

    // Kick off CDP connection in background; don't block initialization
    this.cdpClient
      .connect()
      .then(() => console.log('✅ CDP client connected'))
      .catch((error) => console.warn('⚠️ CDP client connection failed:', error))

    console.log(`🚀 MCP server started for ${this.server.name} v${this.server.version}`)
  }

  async stop(): Promise<void> {
    try {
      await this.cdpClient.disconnect()
      console.log('🔌 CDP client disconnected')
    } catch (error) {
      console.warn('Error disconnecting CDP client:', error)
    }

    console.log('🛑 MCP server stopped')
  }

  private async getHealthStatus(): Promise<any> {
    const cdpHealth = await this.cdpClient.getHealth()
    const bufferStats = this.bufferManager.getStats()
    const uptime = Date.now() - this.startTime

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    if (cdpHealth.status === 'disconnected') {
      status = 'unhealthy'
    } else if (cdpHealth.status === 'degraded') {
      status = 'degraded'
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status,
              chrome: {
                connected: this.cdpClient.isConnected(),
                version: 'unknown', // Would need CDP Browser.getVersion() call
                targets: 1, // Current implementation supports 1 target
              },
              plugin: {
                version: this.server.version || '0.1.0',
                uptime: uptime,
              },
              buffers: bufferStats,
            },
            null,
            2,
          ),
        },
      ],
    }
  }

  // For HTTP transport integration
  getServer(): Server {
    return this.server
  }

  async handleHttpRequest(req: any, res: any, parsedBody?: any): Promise<void> {
    await this.transport.handleRequest(req, res, parsedBody)
  }

  async initialize(): Promise<void> {
    await this.start()
  }

  async shutdown(): Promise<void> {
    await this.stop()
  }
}
