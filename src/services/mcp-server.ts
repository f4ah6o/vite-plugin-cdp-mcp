import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
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
    this.server.setRequestHandler('resources/read', async (request) => {
      if (request.params.uri === '/mcp/health') {
        return await this.getHealthStatus()
      }

      throw new Error(`Resource not found: ${request.params.uri}`)
    })

    // List resources handler
    this.server.setRequestHandler('resources/list', async () => {
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
    try {
      // Connect to Chrome DevTools
      await this.cdpClient.connect()
      console.log('✅ CDP client connected')
    } catch (error) {
      console.warn('⚠️ CDP client connection failed:', error)
      // Continue without CDP connection - will be handled gracefully
    }

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

  async handleRequest(request: any): Promise<any> {
    // This would be used by HTTP transport layer
    return this.server.handleRequest(request)
  }

  async initialize(): Promise<void> {
    await this.start()
  }

  async shutdown(): Promise<void> {
    await this.stop()
  }
}
