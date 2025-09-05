#!/usr/bin/env node

/**
 * Example MCP client for monitoring network requests from vite-plugin-cdp-mcp
 *
 * Usage: node network-example.js
 *
 * Prerequisites:
 * 1. Start Chrome with: chrome --remote-debugging-port=9222
 * 2. Run Vite dev server with the plugin configured
 * 3. Open http://localhost:5173 in Chrome and navigate around
 * 4. Run this script to see captured network activity
 */

import fetch from 'node-fetch'

const MCP_ENDPOINT = 'http://localhost:5173/mcp'

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
  console.log('🌐 Monitoring network requests from Chrome...')

  try {
    // Get recent API calls
    console.log('\n📡 Recent API requests:')
    const apiRequests = await callMCPTool('cdp.network.tail', {
      count: 15,
      domain: 'api', // Filter for API-related requests
    })

    const data = JSON.parse(apiRequests.content[0].text)
    console.log(`Found ${data.requests.length} API requests:`)

    data.requests.forEach((req) => {
      console.log(
        `  ${req.method} ${req.url} - ${req.status || 'pending'} (${req.duration || '?'}ms)`,
      )
    })

    // Get failed requests
    console.log('\n❌ Failed requests:')
    const allRequests = await callMCPTool('cdp.network.tail', {
      count: 50,
    })

    const allData = JSON.parse(allRequests.content[0].text)
    const failedRequests = allData.requests.filter((req) => req.failed || req.status >= 400)

    if (failedRequests.length > 0) {
      failedRequests.forEach((req) => {
        console.log(`  ${req.method} ${req.url} - ${req.status} ${req.failed ? '(FAILED)' : ''}`)
      })
    } else {
      console.log('  No failed requests found')
    }

    // Monitor specific HTTP methods
    console.log('\n📮 POST requests:')
    const postRequests = await callMCPTool('cdp.network.tail', {
      count: 10,
      method: 'POST',
    })

    const postData = JSON.parse(postRequests.content[0].text)
    console.log(`Found ${postData.requests.length} POST requests`)

    postData.requests.forEach((req) => {
      console.log(`  POST ${req.url} - ${req.status || 'pending'}`)
      if (req.requestHeaders && req.requestHeaders['content-type']) {
        console.log(`    Content-Type: ${req.requestHeaders['content-type']}`)
      }
    })
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.log('\n💡 Troubleshooting:')
    console.log('1. Make sure Chrome has network activity (navigate, reload pages)')
    console.log('2. Check Chrome DevTools → Network tab to see if requests are being made')
    console.log('3. Verify the plugin is capturing network events correctly')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
