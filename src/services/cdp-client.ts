import CDP from 'chrome-remote-interface'
import {
  BrowserTarget,
  createBrowserTarget,
  selectPriorityTarget,
  toAttached,
  toActive,
  StatefulBrowserTarget,
  BrowserTargetState,
} from '../models/browser-target.js'

// Enhanced TypeScript interfaces for CDP
export interface CDPClientConfig {
  port: number
  host: string
  maxReconnectAttempts?: number
  reconnectDelay?: number
  connectionTimeout?: number
}

export interface CDPTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
  devtoolsFrontendUrl?: string
  faviconUrl?: string
}

export interface CDPConsoleMessage {
  level: 'log' | 'debug' | 'info' | 'warn' | 'error'
  text: string
  timestamp: number
  source?: 'xml' | 'javascript' | 'network' | 'console-api' | 'storage' | 'appcache' | 'rendering' | 'security' | 'deprecation' | 'worker' | 'violation' | 'intervention' | 'recommendation' | 'other'
  line?: number
  column?: number
  url?: string
  args?: Array<{
    type: string
    value?: any
    description?: string
  }>
}

export interface CDPNetworkEvent {
  type: 'requestWillBeSent' | 'responseReceived' | 'requestFinished' | 'requestFailed'
  requestId: string
  timestamp: number
  request?: {
    url: string
    method: string
    headers: Record<string, string>
    postData?: string
  }
  response?: {
    url: string
    status: number
    statusText: string
    headers: Record<string, string>
    mimeType: string
  }
  error?: {
    errorText: string
    canceled?: boolean
    blockedReason?: string
  }
}

export interface CDPRuntimeEvaluation {
  result?: {
    type: string
    value?: any
    description?: string
    className?: string
  }
  exceptionDetails?: {
    exceptionId: number
    text: string
    lineNumber: number
    columnNumber: number
    scriptId?: string
    url?: string
    stackTrace?: {
      callFrames: Array<{
        functionName: string
        scriptId: string
        url: string
        lineNumber: number
        columnNumber: number
      }>
    }
  }
  executionContextId?: number
}

export interface CDPHealthStatus {
  status: 'healthy' | 'degraded' | 'disconnected' | 'error'
  target?: StatefulBrowserTarget
  lastError?: string
  connectionUptime?: number
  reconnectCount?: number
}

export type ConsoleMessageCallback = (message: CDPConsoleMessage) => void
export type NetworkEventCallback = (event: CDPNetworkEvent) => void

export class CDPConnectionError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message)
    this.name = 'CDPConnectionError'
  }
}

export class CDPTargetError extends Error {
  constructor(message: string, public targetId?: string) {
    super(message)
    this.name = 'CDPTargetError'
  }
}

export class CDPEvaluationError extends Error {
  constructor(message: string, public details?: any) {
    super(message)
    this.name = 'CDPEvaluationError'
  }
}

export class CDPClient {
  private config: CDPClientConfig
  private client: any = null
  private target: StatefulBrowserTarget | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts: number
  private reconnectDelay: number
  private connectionTimeout: number
  private connectionStartTime?: number
  private consoleListeners: Set<ConsoleMessageCallback> = new Set()
  private networkListeners: Set<NetworkEventCallback> = new Set()
  private consoleHandlerAttached = false
  private networkHandlerAttached = false

  constructor(config: CDPClientConfig) {
    this.config = config
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 3
    this.reconnectDelay = config.reconnectDelay ?? 1000
    this.connectionTimeout = config.connectionTimeout ?? 10000
  }

  async connect(): Promise<void> {
    if (this.client) {
      return // Already connected
    }

    try {
      this.connectionStartTime = Date.now()
      
      // Discover available targets with timeout
      const targets = await this.withTimeout(
        this.discoverTargets(),
        this.connectionTimeout,
        'Target discovery timeout'
      )

      // Select priority target (localhost:5173 first)
      let selectedTarget = selectPriorityTarget(targets)

      if (!selectedTarget) {
        // Create a new target if none suitable found
        selectedTarget = await this.createNewTarget()
      }

      if (!selectedTarget) {
        throw new CDPTargetError('No suitable browser target found and unable to create new target')
      }

      // Convert to StatefulBrowserTarget if needed
      this.target = selectedTarget.state ? selectedTarget as StatefulBrowserTarget : createBrowserTarget(selectedTarget)

      // Connect to the selected target with timeout
      this.client = await this.withTimeout(
        CDP({
          target: this.target.id,
          port: this.config.port,
          host: this.config.host,
        }),
        this.connectionTimeout,
        `Connection timeout to target ${this.target.id}`
      )

      // Enable required domains
      await Promise.all([
        this.client.Runtime.enable(),
        this.client.Console.enable(),
        this.client.Network.enable(),
        this.client.Page.enable(),
      ])

      // Update target state
      this.target = toActive(toAttached(this.target))
      this.reconnectAttempts = 0

      // Attach event listeners
      await this.attachEventListeners()
      
      // Attach any queued callbacks to the event listeners
      this.setupEventHandlers()
    } catch (error) {
      await this.handleConnectionError(error)
    }
  }

  private async discoverTargets(): Promise<BrowserTarget[]> {
    const targets = await CDP.List({
      port: this.config.port,
      host: this.config.host,
    })

    return targets
      .filter((target: any) => target.type === 'page' && target.webSocketDebuggerUrl)
      .map((target: any) =>
        createBrowserTarget({
          id: target.id,
          url: target.url,
          title: target.title || '',
          type: 'page',
          attached: false,
          canAttach: true,
          lastActivity: Date.now(),
        }),
      )
  }

  private async createNewTarget(): Promise<void> {
    try {
      const newTarget = await CDP.New({
        url: 'http://localhost:5173',
        port: this.config.port,
        host: this.config.host,
      })

      this.target = createBrowserTarget({
        id: newTarget.id,
        url: newTarget.url,
        title: newTarget.title || '',
        type: 'page',
        attached: false,
        canAttach: true,
        lastActivity: Date.now(),
      })
    } catch (error) {
      // Failed to create new target, will use existing if available
      console.warn('Failed to create new target:', error)
    }
  }

  private async handleConnectionError(error: any): Promise<void> {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

      console.warn(
        `CDP connection failed, retrying in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
      await this.connect()
    } else {
      throw new Error(
        `Failed to connect to Chrome DevTools after ${this.maxReconnectAttempts} attempts: ${error.message}`,
      )
    }
  }

  private attachQueuedListeners(): void {
    if (!this.client) return

    // Console listeners
    if (this.consoleListeners.length > 0) {
      this.client.Console.messageAdded((params: any) => {
        for (const cb of this.consoleListeners) {
          try {
            cb(params.message)
          } catch (e) {
            // Swallow listener errors to avoid breaking others
          }
        }
      })
    }

    // Network listeners
    if (this.networkListeners.length > 0) {
      this.client.Network.requestWillBeSent((params: any) => {
        const event = { type: 'requestWillBeSent', ...params }
        for (const cb of this.networkListeners) {
          try {
            cb(event)
          } catch {}
        }
      })

      this.client.Network.responseReceived((params: any) => {
        const event = { type: 'responseReceived', ...params }
        for (const cb of this.networkListeners) {
          try {
            cb(event)
          } catch {}
        }
      })

      this.client.Network.requestFinished((params: any) => {
        const event = { type: 'requestFinished', ...params }
        for (const cb of this.networkListeners) {
          try {
            cb(event)
          } catch {}
        }
      })

      this.client.Network.requestFailed((params: any) => {
        const event = { type: 'requestFailed', ...params }
        for (const cb of this.networkListeners) {
          try {
            cb(event)
          } catch {}
        }
      })
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close()
      } catch (error) {
        console.warn('Error closing CDP client:', error)
      } finally {
        this.client = null
        this.target = null
        this.reconnectAttempts = 0
      }
    }
  }

  async evaluateExpression(expression: string, timeout = 10000): Promise<any> {
    if (!this.client) {
      throw new Error('CDP client not connected')
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Evaluation timeout')), timeout)
    })

    const evaluationPromise = this.client.Runtime.evaluate({
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeout,
    })

    return Promise.race([evaluationPromise, timeoutPromise])
  }

  onConsoleMessage(callback: (message: any) => void): void {
    // Store the listener; if connected, ensure it's attached via shared handler
    this.consoleListeners.push(callback)
    if (this.client) {
      // Re-attach all to be safe; Chrome client ignores duplicate handler bindings per instance
      this.attachQueuedListeners()
    }
  }

  onNetworkRequest(callback: (request: any) => void): void {
    this.networkListeners.push(callback)
    if (this.client) {
      this.attachQueuedListeners()
    }
  }

  isConnected(): boolean {
    return this.client !== null
  }

  getCurrentTarget(): BrowserTarget | null {
    return this.target
  }

  async getHealth(): Promise<{ status: string; target?: BrowserTarget }> {
    if (!this.isConnected() || !this.target) {
      return { status: 'disconnected' }
    }

    try {
      // Simple health check by getting browser version
      await this.client.Browser.getVersion()
      return {
        status: 'healthy',
        target: this.target,
      }
    } catch (error) {
      return {
        status: 'degraded',
        target: this.target,
      }
    }
  }
}
