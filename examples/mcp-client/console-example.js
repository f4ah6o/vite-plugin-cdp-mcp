#!/usr/bin/env node

/**
 * Example MCP client for consuming console logs from vite-plugin-cdp-mcp
 *
 * Usage: node console-example.js
 *
 * Prerequisites:
 * 1. Start Chrome with: chrome --remote-debugging-port=9222
 * 2. Run Vite dev server with the plugin configured
 * 3. Open http://localhost:5173 in Chrome
 * 4. Run this script to retrieve console logs
 */

import fetch from 'node-fetch'

const MCP_ENDPOINT = 'http://localhost:5173/mcp'

// MCP JSON-RPC request structure
async function callMCPTool(toolName, args = {}) {
  const request = {
    jsonrpc: '2.0',
    id: Math.random().toString(36),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  }

  try {
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()

    if (result.error) {
      throw new Error(`MCP Error: ${result.error.message}`)
    }

    return result.result
  } catch (error) {
    console.error('Failed to call MCP tool:', error.message)
    throw error
  }
}

async function main() {
  console.log('🔍 Retrieving console logs from Chrome...')

  try {
    // Get recent error logs
    console.log('\n📋 Recent error logs:')
    const errorLogs = await callMCPTool('cdp.console.tail', {
      count: 10,
      level: 'error',
    })

    console.log(JSON.stringify(JSON.parse(errorLogs.content[0].text), null, 2))

    // Get all recent logs
    console.log('\n📋 Recent console activity:')
    const allLogs = await callMCPTool('cdp.console.tail', {
      count: 20,
      since: Date.now() - 60000, // Last minute
    })

    console.log(JSON.stringify(JSON.parse(allLogs.content[0].text), null, 2))
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.log('\n💡 Troubleshooting:')
    console.log('1. Ensure Chrome is running with --remote-debugging-port=9222')
    console.log('2. Make sure Vite dev server is running on localhost:5173')
    console.log('3. Check that a tab is open at http://localhost:5173')
    console.log('4. Verify the CDP-MCP plugin is configured correctly')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
