#!/usr/bin/env node

/**
 * Example MCP client for executing JavaScript in Chrome via vite-plugin-cdp-mcp
 *
 * Usage: node eval-example.js
 *
 * Prerequisites:
 * 1. Start Chrome with: chrome --remote-debugging-port=9222
 * 2. Run Vite dev server with the plugin configured
 * 3. Open http://localhost:5173 in Chrome
 * 4. Run this script to execute JavaScript in the browser context
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

async function evaluateExpression(expression, description) {
  console.log(`\n🧮 ${description}`)
  console.log(`Expression: ${expression}`)

  try {
    const result = await callMCPTool('cdp.runtime.eval', {
      expression,
      timeout: 2000,
    })

    const data = JSON.parse(result.content[0].text)

    if (data.error) {
      console.log(`❌ Error: ${data.error}`)
      if (data.consoleOutput && data.consoleOutput.length > 0) {
        console.log(`Console output during error:`)
        data.consoleOutput.forEach((entry) => {
          console.log(`  ${entry.level}: ${entry.message}`)
        })
      }
    } else {
      console.log(`✅ Result: ${JSON.stringify(data.result)}`)
      console.log(`⏱️  Duration: ${data.duration}ms`)

      if (data.consoleOutput && data.consoleOutput.length > 0) {
        console.log(`Console output:`)
        data.consoleOutput.forEach((entry) => {
          console.log(`  ${entry.level}: ${entry.message}`)
        })
      }
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`)
  }
}

async function main() {
  console.log('⚡ Executing JavaScript in Chrome browser context...')

  try {
    // Basic arithmetic
    await evaluateExpression('2 + 2', 'Simple arithmetic')

    // DOM inspection
    await evaluateExpression('document.title', 'Page title')

    // Window properties
    await evaluateExpression('window.location.href', 'Current URL')

    // Complex expression with console output
    await evaluateExpression(
      `
      console.log('Starting computation...');
      const result = Array.from({length: 5}, (_, i) => i * i);
      console.log('Result:', result);
      result.reduce((a, b) => a + b, 0)
    `,
      'Array computation with console output',
    )

    // DOM query
    await evaluateExpression(
      `
      const elements = document.querySelectorAll('script');
      Array.from(elements).map(el => el.src || 'inline').slice(0, 3)
    `,
      'Script tags inspection',
    )

    // Promise example (will be awaited automatically)
    await evaluateExpression(
      `
      new Promise(resolve => {
        console.log('Promise started');
        setTimeout(() => {
          console.log('Promise resolved');
          resolve('Delayed result after 100ms');
        }, 100);
      })
    `,
      'Async promise with timeout',
    )

    // Performance measurement
    await evaluateExpression(
      `
      const start = performance.now();
      const result = Math.sqrt(123456789);
      const duration = performance.now() - start;
      console.log(\`Math.sqrt computation took \${duration}ms\`);
      { result, computationTime: duration }
    `,
      'Performance measurement',
    )

    // Intentional error for demonstration
    await evaluateExpression('nonExistentVariable.someProperty', 'Error handling example')
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.log('\n💡 Troubleshooting:')
    console.log('1. Ensure Chrome tab is open and active')
    console.log('2. Check browser console for any JavaScript errors')
    console.log('3. Verify the page has finished loading')
    console.log('4. Try refreshing the browser tab')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
