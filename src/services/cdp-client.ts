import CDP from 'chrome-remote-interface'
import { BrowserTarget, createBrowserTarget, selectPriorityTarget, toAttached, toActive } from '../models/browser-target.js'

export interface CDPClientConfig {
  port: number
  host: string
}

export class CDPClient {
  private config: CDPClientConfig
  private client: any = null
  private target: BrowserTarget | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private reconnectDelay = 1000

  constructor(config: CDPClientConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    try {
      // Discover available targets
      const targets = await this.discoverTargets()
      
      // Select priority target (localhost:5173 first)
      this.target = selectPriorityTarget(targets)
      
      if (!this.target) {
        // Create a new target if none suitable found
        await this.createNewTarget()
      }

      if (!this.target) {
        throw new Error('No suitable browser target found and unable to create new target')
      }

      // Connect to the selected target
      this.client = await CDP({ 
        target: this.target.id,
        port: this.config.port,
        host: this.config.host
      })

      // Enable required domains
      await Promise.all([
        this.client.Runtime.enable(),
        this.client.Console.enable(),
        this.client.Network.enable(),
        this.client.Page.enable()
      ])

      // Update target state
      this.target = toActive(toAttached(this.target))
      this.reconnectAttempts = 0

    } catch (error) {
      await this.handleConnectionError(error)
    }
  }

  private async discoverTargets(): Promise<BrowserTarget[]> {
    const targets = await CDP.List({ 
      port: this.config.port, 
      host: this.config.host 
    })
    
    return targets
      .filter((target: any) => target.type === 'page' && target.webSocketDebuggerUrl)
      .map((target: any) => createBrowserTarget({
        id: target.id,
        url: target.url,
        title: target.title || '',
        type: 'page',
        attached: false,
        canAttach: true,
        lastActivity: Date.now()
      }))
  }

  private async createNewTarget(): Promise<void> {
    try {
      const newTarget = await CDP.New({ 
        url: 'http://localhost:5173',
        port: this.config.port,
        host: this.config.host
      })
      
      this.target = createBrowserTarget({
        id: newTarget.id,
        url: newTarget.url,
        title: newTarget.title || '',
        type: 'page',
        attached: false,
        canAttach: true,
        lastActivity: Date.now()
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
      
      console.warn(`CDP connection failed, retrying in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
      await new Promise(resolve => setTimeout(resolve, delay))
      await this.connect()
    } else {
      throw new Error(`Failed to connect to Chrome DevTools after ${this.maxReconnectAttempts} attempts: ${error.message}`)
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
      timeout: timeout
    })

    return Promise.race([evaluationPromise, timeoutPromise])
  }

  onConsoleMessage(callback: (message: any) => void): void {
    if (!this.client) {
      throw new Error('CDP client not connected')
    }

    this.client.Console.messageAdded((params: any) => {
      callback(params.message)
    })
  }

  onNetworkRequest(callback: (request: any) => void): void {
    if (!this.client) {
      throw new Error('CDP client not connected')
    }

    this.client.Network.requestWillBeSent((params: any) => {
      callback({
        type: 'requestWillBeSent',
        ...params
      })
    })

    this.client.Network.responseReceived((params: any) => {
      callback({
        type: 'responseReceived',
        ...params
      })
    })

    this.client.Network.requestFinished((params: any) => {
      callback({
        type: 'requestFinished',
        ...params
      })
    })

    this.client.Network.requestFailed((params: any) => {
      callback({
        type: 'requestFailed',
        ...params
      })
    })
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
        target: this.target 
      }
    } catch (error) {
      return { 
        status: 'degraded', 
        target: this.target 
      }
    }
  }
}