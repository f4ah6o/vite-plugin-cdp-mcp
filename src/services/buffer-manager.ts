import { ConsoleEntry, StatefulConsoleEntry } from '../models/console-entry.js'
import { NetworkRequest, StatefulNetworkRequest } from '../models/network-request.js'

export interface BufferConfig {
  console: number
  network: number
}

export interface QueryOptions {
  count?: number
  since?: number
  level?: string
  method?: string
  status?: number
  domain?: string
}

export class CircularBuffer<T> {
  private items: T[] = []
  private capacity: number
  private nextIndex = 0

  constructor(capacity: number) {
    this.capacity = capacity
    this.items = new Array(capacity)
  }

  add(item: T): void {
    this.items[this.nextIndex] = item
    this.nextIndex = (this.nextIndex + 1) % this.capacity
  }

  getAll(): T[] {
    const result: T[] = []

    // Start from the oldest item (next index) and go full circle
    for (let i = 0; i < this.capacity; i++) {
      const index = (this.nextIndex + i) % this.capacity
      const item = this.items[index]
      if (item !== undefined) {
        result.push(item)
      }
    }

    return result
  }

  size(): number {
    return this.items.filter((item) => item !== undefined).length
  }

  clear(): void {
    this.items = new Array(this.capacity)
    this.nextIndex = 0
  }

  // Expose configured capacity
  getCapacity(): number {
    return this.capacity
  }

  // Replace first item matching predicate; returns true if replaced
  replaceFirst(predicate: (item: T) => boolean, newItem: T): boolean {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]
      if (item !== undefined && predicate(item)) {
        this.items[i] = newItem
        return true
      }
    }
    return false
  }
}

export class BufferManager {
  private consoleBuffer: CircularBuffer<StatefulConsoleEntry>
  private networkBuffer: CircularBuffer<StatefulNetworkRequest>

  constructor(config: BufferConfig) {
    this.consoleBuffer = new CircularBuffer(config.console)
    this.networkBuffer = new CircularBuffer(config.network)
  }

  // Console buffer methods
  addConsoleEntry(entry: StatefulConsoleEntry): void {
    this.consoleBuffer.add(entry)
  }

  queryConsoleEntries(options: QueryOptions = {}): {
    entries: ConsoleEntry[]
    totalCount: number
  } {
    let entries = this.consoleBuffer.getAll()

    // Apply filters
    if (options.level) {
      entries = entries.filter((entry) => entry.level === options.level)
    }

    if (options.since) {
      entries = entries.filter((entry) => entry.timestamp >= options.since!)
    }

    // Sort by timestamp (chronological order)
    entries.sort((a, b) => a.timestamp - b.timestamp)

    const totalCount = entries.length

    // Apply limit
    if (options.count && options.count > 0) {
      entries = entries.slice(-options.count) // Get most recent N entries
    }

    return {
      entries: entries.map(({ state, ...entry }) => entry), // Remove state from response
      totalCount,
    }
  }

  // Network buffer methods
  addNetworkRequest(request: StatefulNetworkRequest): void {
    // Update existing request if present; otherwise add new
    const replaced = this.networkBuffer.replaceFirst(
      (req) => req.requestId === request.requestId,
      request,
    )
    if (!replaced) {
      this.networkBuffer.add(request)
    }
  }

  queryNetworkRequests(options: QueryOptions = {}): {
    requests: NetworkRequest[]
    totalCount: number
  } {
    let requests = this.networkBuffer.getAll()

    // Apply filters
    if (options.method) {
      requests = requests.filter((req) => req.method === options.method)
    }

    if (options.status) {
      requests = requests.filter((req) => req.status === options.status)
    }

    if (options.domain) {
      requests = requests.filter((req) => {
        try {
          const url = new URL(req.url)
          return url.hostname.includes(options.domain!)
        } catch {
          return false
        }
      })
    }

    if (options.since) {
      requests = requests.filter((req) => req.timestamp >= options.since!)
    }

    // Sort by timestamp (chronological order)
    requests.sort((a, b) => a.timestamp - b.timestamp)

    const totalCount = requests.length

    // Apply limit
    if (options.count && options.count > 0) {
      requests = requests.slice(-options.count) // Get most recent N requests
    }

    return {
      requests: requests.map(({ state, ...request }) => request), // Remove state from response
      totalCount,
    }
  }

  // Buffer statistics
  getStats(): {
    console: { size: number; capacity: number }
    network: { size: number; capacity: number }
  } {
    return {
      console: {
        size: this.consoleBuffer.size(),
        capacity: this.consoleBuffer.getCapacity(),
      },
      network: {
        size: this.networkBuffer.size(),
        capacity: this.networkBuffer.getCapacity(),
      },
    }
  }

  // Clear all buffers
  clear(): void {
    this.consoleBuffer.clear()
    this.networkBuffer.clear()
  }
}
