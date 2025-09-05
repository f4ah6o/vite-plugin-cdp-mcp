import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { CDPClient } from './cdp-client.js'
import { assertExpressionSafe } from '../lib/security-validator.js'
import { BufferManager, QueryOptions } from './buffer-manager.js'
import { createConsoleEntry, toBuffered, toStreamed } from '../models/console-entry.js'
import {
  createNetworkRequest,
  toUpdated,
  toCompleted,
  toFailed,
} from '../models/network-request.js'
import {
  createRuntimeEvaluation,
  toExecuted,
  toCompleted as toEvaluationCompleted,
  toFailed as toEvaluationFailed,
} from '../models/runtime-evaluation.js'

// Tool input schemas based on MCP contracts
const ConsoleToolInputSchema = z.object({
  count: z.number().int().min(1).max(1000).default(50),
  level: z.enum(['log', 'debug', 'info', 'warn', 'error']).optional(),
  since: z.number().int().optional(),
})

const NetworkToolInputSchema = z.object({
  count: z.number().int().min(1).max(100).default(20),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']).optional(),
  status: z.number().int().min(100).max(599).optional(),
  domain: z.string().optional(),
})

const RuntimeEvalInputSchema = z.object({
  expression: z.string().min(1),
  awaitPromise: z.boolean().default(false),
  returnByValue: z.boolean().default(true),
  timeout: z.number().int().min(100).max(30000).default(5000),
})

export class MCPTools {
  private cdpClient: CDPClient
  private bufferManager: BufferManager
  private consoleOutputBuffer: any[] = []

  constructor(cdpClient: CDPClient, bufferManager: BufferManager) {
    this.cdpClient = cdpClient
    this.bufferManager = bufferManager

    // Set up CDP event listeners
    this.setupCDPListeners()
  }

  private setupCDPListeners(): void {
    // Console message listener
    this.cdpClient.onConsoleMessage((message: any) => {
      try {
        const consoleEntry = createConsoleEntry({
          level:
            message.level === 'log'
              ? 'log'
              : message.level === 'warning'
                ? 'warn'
                : message.level === 'error'
                  ? 'error'
                  : message.level === 'info'
                    ? 'info'
                    : message.level === 'debug'
                      ? 'debug'
                      : 'log',
          timestamp: Date.now(),
          message: message.text || '',
          source:
            message.url && message.line
              ? `${message.url}:${message.line}:${message.column || 0}`
              : 'unknown',
        })

        const bufferedEntry = toBuffered(consoleEntry)
        this.bufferManager.addConsoleEntry(bufferedEntry)
      } catch (error) {
        console.warn('Failed to process console message:', error)
      }
    })

    // Network request listener
    this.cdpClient.onNetworkRequest((event: any) => {
      try {
        if (event.type === 'requestWillBeSent') {
          const networkRequest = createNetworkRequest({
            requestId: event.requestId,
            url: event.request.url,
            method: event.request.method,
            origin: event.request.headers?.referer || event.request.url,
            timestamp: Date.now(),
            requestHeaders: event.request.headers || {},
            failed: false,
          })

          this.bufferManager.addNetworkRequest(networkRequest)
        } else if (event.type === 'responseReceived') {
          // Find existing request and update it
          const requests = this.bufferManager.queryNetworkRequests().requests
          const existingRequest = requests.find((req) => req.requestId === event.requestId)

          if (existingRequest) {
            const updatedRequest = toUpdated(
              createNetworkRequest({
                ...existingRequest,
                status: event.response.status,
                responseHeaders: event.response.headers || {},
              }),
            )
            this.bufferManager.addNetworkRequest(updatedRequest)
          }
        } else if (event.type === 'requestFinished') {
          // Mark request as completed
          const requests = this.bufferManager.queryNetworkRequests().requests
          const existingRequest = requests.find((req) => req.requestId === event.requestId)

          if (existingRequest) {
            const completedRequest = toCompleted(
              toUpdated(
                createNetworkRequest({
                  ...existingRequest,
                  duration: event.encodedDataLength
                    ? Date.now() - existingRequest.timestamp
                    : undefined,
                }),
              ),
            )
            this.bufferManager.addNetworkRequest(completedRequest)
          }
        } else if (event.type === 'requestFailed') {
          // Mark request as failed
          const requests = this.bufferManager.queryNetworkRequests().requests
          const existingRequest = requests.find((req) => req.requestId === event.requestId)

          if (existingRequest) {
            const failedRequest = toFailed(
              createNetworkRequest({
                ...existingRequest,
                failed: true,
                duration: Date.now() - existingRequest.timestamp,
              }),
            )
            this.bufferManager.addNetworkRequest(failedRequest)
          }
        }
      } catch (error) {
        console.warn('Failed to process network event:', error)
      }
    })
  }

  async handleConsoleTail(args: any): Promise<any> {
    const input = ConsoleToolInputSchema.parse(args)
    const target = this.cdpClient.getCurrentTarget()

    if (!target) {
      throw new Error('No browser target available')
    }

    const queryOptions: QueryOptions = {
      count: input.count,
      level: input.level,
      since: input.since,
    }

    const result = this.bufferManager.queryConsoleEntries(queryOptions)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              entries: result.entries,
              totalCount: result.totalCount,
              target: {
                id: target.id,
                url: target.url,
                title: target.title,
              },
            },
            null,
            2,
          ),
        },
      ],
    }
  }

  async handleNetworkTail(args: any): Promise<any> {
    const input = NetworkToolInputSchema.parse(args)
    const target = this.cdpClient.getCurrentTarget()

    if (!target) {
      throw new Error('No browser target available')
    }

    const queryOptions: QueryOptions = {
      count: input.count,
      method: input.method,
      status: input.status,
      domain: input.domain,
    }

    const result = this.bufferManager.queryNetworkRequests(queryOptions)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              requests: result.requests,
              totalCount: result.totalCount,
              target: {
                id: target.id,
                url: target.url,
                title: target.title,
              },
            },
            null,
            2,
          ),
        },
      ],
    }
  }

  async handleRuntimeEval(args: any): Promise<any> {
    const input = RuntimeEvalInputSchema.parse(args)
    const target = this.cdpClient.getCurrentTarget()

    if (!target) {
      throw new Error('No browser target available')
    }

    const startTime = Date.now()
    const evalId = `eval_${startTime}_${Math.random().toString(36).substr(2, 9)}`

    // Clear console output buffer for this evaluation
    this.consoleOutputBuffer = []

    let evaluation = createRuntimeEvaluation({
      id: evalId,
      expression: input.expression,
      timestamp: startTime,
      consoleOutput: [],
      duration: 0,
    })

    try {
      // Enforce read-only eval policy in development
      assertExpressionSafe(input.expression)

      evaluation = toExecuted(evaluation)

      // Execute the expression
      const result = await this.cdpClient.evaluateExpression(input.expression, input.timeout)
      const endTime = Date.now()

      if (result.exceptionDetails) {
        // Evaluation failed
        evaluation = toEvaluationFailed({
          ...evaluation,
          error: result.exceptionDetails.exception?.description || 'Evaluation failed',
          duration: endTime - startTime,
          consoleOutput: [...this.consoleOutputBuffer],
        })
      } else {
        // Evaluation succeeded
        evaluation = toEvaluationCompleted({
          ...evaluation,
          result: result.result.value,
          duration: endTime - startTime,
          consoleOutput: [...this.consoleOutputBuffer],
        })
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: evaluation.id,
                expression: evaluation.expression,
                timestamp: evaluation.timestamp,
                result: evaluation.result,
                error: evaluation.error,
                consoleOutput: evaluation.consoleOutput,
                duration: evaluation.duration,
                target: {
                  id: target.id,
                  url: target.url,
                  title: target.title,
                },
              },
              null,
              2,
            ),
          },
        ],
      }
    } catch (error) {
      const endTime = Date.now()
      evaluation = toEvaluationFailed({
        ...evaluation,
        error: error instanceof Error ? error.message : 'Unknown evaluation error',
        duration: endTime - startTime,
        consoleOutput: [...this.consoleOutputBuffer],
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: evaluation.id,
                expression: evaluation.expression,
                timestamp: evaluation.timestamp,
                error: evaluation.error,
                consoleOutput: evaluation.consoleOutput,
                duration: evaluation.duration,
                target: {
                  id: target.id,
                  url: target.url,
                  title: target.title,
                },
              },
              null,
              2,
            ),
          },
        ],
      }
    }
  }

  getToolDefinitions(): any[] {
    return [
      {
        name: 'cdp.console.tail',
        description: 'Retrieve recent console log entries from Chrome browser',
        inputSchema: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              minimum: 1,
              maximum: 1000,
              default: 50,
              description: 'Number of recent console entries to retrieve',
            },
            level: {
              type: 'string',
              enum: ['log', 'debug', 'info', 'warn', 'error'],
              description: 'Filter by console log level (optional)',
            },
            since: {
              type: 'number',
              description: 'Unix timestamp - only return entries after this time (optional)',
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'cdp.network.tail',
        description: 'Retrieve recent network request information from Chrome browser',
        inputSchema: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              default: 20,
              description: 'Number of recent network requests to retrieve',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
              description: 'Filter by HTTP method (optional)',
            },
            status: {
              type: 'number',
              minimum: 100,
              maximum: 599,
              description: 'Filter by HTTP status code (optional)',
            },
            domain: {
              type: 'string',
              description: 'Filter by request domain (optional)',
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'cdp.runtime.eval',
        description: 'Execute JavaScript code in Chrome browser context and return results',
        inputSchema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              minLength: 1,
              description: 'JavaScript code to evaluate in browser context',
            },
            awaitPromise: {
              type: 'boolean',
              default: false,
              description: 'Whether to await promise results',
            },
            returnByValue: {
              type: 'boolean',
              default: true,
              description: 'Whether to return result by value or object reference',
            },
            timeout: {
              type: 'number',
              minimum: 100,
              maximum: 30000,
              default: 5000,
              description: 'Evaluation timeout in milliseconds',
            },
          },
          required: ['expression'],
          additionalProperties: false,
        },
      },
    ]
  }

  async callTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'cdp.console.tail':
        return this.handleConsoleTail(args)
      case 'cdp.network.tail':
        return this.handleNetworkTail(args)
      case 'cdp.runtime.eval':
        return this.handleRuntimeEval(args)
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }
}
