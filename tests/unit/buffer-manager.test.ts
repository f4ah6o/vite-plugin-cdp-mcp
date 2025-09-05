import { describe, it, expect } from 'vitest'

import { BufferManager, CircularBuffer } from '../../src/services/buffer-manager.js'
import { ConsoleEntryState, createConsoleEntry, toBuffered } from '../../src/models/console-entry.js'
import {
  NetworkRequestState,
  createNetworkRequest,
  toUpdated,
  toCompleted,
  toFailed,
} from '../../src/models/network-request.js'

describe('T025 Unit: Buffer Management', () => {
  describe('CircularBuffer', () => {
    it('stores up to capacity and returns in chronological order', () => {
      const buf = new CircularBuffer<number>(3)
      buf.add(1)
      buf.add(2)
      buf.add(3)
      expect(buf.getAll()).toEqual([1, 2, 3])
      expect(buf.size()).toBe(3)

      // Overwrite oldest
      buf.add(4)
      expect(buf.getAll()).toEqual([2, 3, 4])
      expect(buf.size()).toBe(3)
    })

    it('clears items and resets size', () => {
      const buf = new CircularBuffer<string>(2)
      buf.add('a')
      buf.add('b')
      expect(buf.size()).toBe(2)
      buf.clear()
      expect(buf.size()).toBe(0)
      expect(buf.getAll()).toEqual([])
    })

    it('exposes configured capacity', () => {
      const cap = 5
      const buf = new CircularBuffer<boolean>(cap)
      expect(buf.capacity()).toBe(cap)
    })
  })

  describe('BufferManager - console buffer', () => {
    const makeEntry = (level: 'log' | 'info' | 'warn' | 'error' | 'debug', ts: number, msg: string) =>
      toBuffered(
        createConsoleEntry({
          level,
          timestamp: ts,
          message: msg,
          source: 'main.ts:1:1',
        }),
      )

    it('stores entries up to capacity and overwrites oldest', () => {
      const bm = new BufferManager({ console: 3, network: 2 })
      bm.addConsoleEntry(makeEntry('log', 1, 'a'))
      bm.addConsoleEntry(makeEntry('info', 2, 'b'))
      bm.addConsoleEntry(makeEntry('warn', 3, 'c'))
      bm.addConsoleEntry(makeEntry('error', 4, 'd')) // overwrites oldest

      const res = bm.queryConsoleEntries()
      expect(res.totalCount).toBe(3)
      // Sorted chronologically, should be last three
      expect(res.entries.map((e) => e.message)).toEqual(['b', 'c', 'd'])
      // State should be stripped
      expect('state' in (res.entries[0] as any)).toBe(false)
    })

    it('filters by level and since, and limits by count', () => {
      const bm = new BufferManager({ console: 10, network: 2 })
      bm.addConsoleEntry(makeEntry('info', 10, 'i1'))
      bm.addConsoleEntry(makeEntry('error', 20, 'e1'))
      bm.addConsoleEntry(makeEntry('error', 30, 'e2'))
      bm.addConsoleEntry(makeEntry('log', 40, 'l1'))
      bm.addConsoleEntry(makeEntry('error', 50, 'e3'))

      // Filter by level
      const byLevel = bm.queryConsoleEntries({ level: 'error' })
      expect(byLevel.totalCount).toBe(3)
      expect(byLevel.entries.map((e) => e.message)).toEqual(['e1', 'e2', 'e3'])

      // Filter since timestamp
      const since = bm.queryConsoleEntries({ since: 30 })
      expect(since.totalCount).toBe(3)
      expect(since.entries.map((e) => e.message)).toEqual(['e2', 'l1', 'e3'])

      // Limit to most recent N after sorting
      const limited = bm.queryConsoleEntries({ level: 'error', count: 2 })
      expect(limited.totalCount).toBe(3)
      expect(limited.entries.map((e) => e.message)).toEqual(['e2', 'e3'])
    })
  })

  describe('BufferManager - network buffer', () => {
    const baseReq = {
      requestId: 'req-1',
      url: 'https://example.com/api',
      method: 'GET' as const,
      origin: 'https://example.com',
      timestamp: 1000,
      requestHeaders: { Accept: 'application/json' },
      failed: false,
    }

    it('updates existing request by requestId across lifecycle', () => {
      const bm = new BufferManager({ console: 2, network: 10 })

      const created = createNetworkRequest(baseReq)
      bm.addNetworkRequest(created)

      const updated = toUpdated({ ...created, timestamp: 1100 })
      bm.addNetworkRequest(updated)

      const completed = toCompleted({ ...updated, status: 200, duration: 50, responseHeaders: { 'Content-Type': 'application/json' } })
      bm.addNetworkRequest(completed)

      const res = bm.queryNetworkRequests()
      expect(res.totalCount).toBe(1)
      expect(res.requests[0]).toMatchObject({
        requestId: 'req-1',
        status: 200,
        duration: 50,
      })
      // State removed in response
      expect('state' in (res.requests[0] as any)).toBe(false)
    })

    it('filters by method, status, domain and since, and limits by count', () => {
      const bm = new BufferManager({ console: 2, network: 10 })

      const r1 = createNetworkRequest({
        requestId: 'a',
        url: 'https://api.example.com/users',
        method: 'GET',
        origin: 'https://app.example.com',
        timestamp: 100,
        requestHeaders: {},
        failed: false,
      })
      const r2 = toFailed(
        createNetworkRequest({
          requestId: 'b',
          url: 'https://example.org/login',
          method: 'POST',
          origin: 'https://example.org',
          timestamp: 200,
          requestHeaders: {},
          failed: true,
        }),
      )
      const r3 = toCompleted(
        toUpdated(
          createNetworkRequest({
            requestId: 'c',
            url: 'https://cdn.example.com/assets/app.js',
            method: 'GET',
            origin: 'https://app.example.com',
            timestamp: 300,
            requestHeaders: {},
            failed: false,
          }),
        ),
      )
      const r3Completed = { ...r3, status: 200, duration: 10 }

      bm.addNetworkRequest(r1)
      bm.addNetworkRequest(r2)
      bm.addNetworkRequest(r3Completed)

      // By method
      const byMethod = bm.queryNetworkRequests({ method: 'GET' })
      expect(byMethod.totalCount).toBe(2)

      // By status
      const byStatus = bm.queryNetworkRequests({ status: 200 })
      expect(byStatus.totalCount).toBe(1)
      expect(byStatus.requests[0].requestId).toBe('c')

      // By domain (hostname contains)
      const byDomain = bm.queryNetworkRequests({ domain: 'example.com' })
      expect(byDomain.totalCount).toBe(2)

      // Since timestamp
      const since = bm.queryNetworkRequests({ since: 200 })
      expect(since.totalCount).toBe(2)

      // Limit count (most recent after sort)
      const limited = bm.queryNetworkRequests({ count: 1 })
      expect(limited.totalCount).toBe(3)
      expect(limited.requests[0].requestId).toBe('c')
    })
  })

  describe('BufferManager - stats and clear', () => {
    it('reports sizes and capacities; clear empties both buffers', () => {
      const bm = new BufferManager({ console: 3, network: 4 })

      const e1 = toBuffered(
        createConsoleEntry({ level: 'log', timestamp: 1, message: 'x', source: 'file.ts:1:1' }),
      )
      bm.addConsoleEntry(e1)

      const r1 = createNetworkRequest({
        requestId: 'z',
        url: 'https://example.com',
        method: 'GET',
        origin: 'https://example.com',
        timestamp: 1,
        requestHeaders: {},
        failed: false,
      })
      bm.addNetworkRequest(r1)

      let stats = bm.getStats()
      expect(stats.console.size).toBe(1)
      expect(stats.network.size).toBe(1)
      expect(stats.console.capacity).toBe(3)
      expect(stats.network.capacity).toBe(4)

      bm.clear()
      stats = bm.getStats()
      expect(stats.console.size).toBe(0)
      expect(stats.network.size).toBe(0)
    })
  })
})

