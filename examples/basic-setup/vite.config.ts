import { defineConfig } from 'vite'
import cdpMcpPlugin from 'vite-plugin-cdp-mcp'

export default defineConfig({
  plugins: [
    // Basic CDP-MCP integration
    cdpMcpPlugin({
      port: 9222, // Chrome remote debugging port
      mcpPath: '/mcp', // MCP server endpoint
      bufferSize: {
        console: 1000, // Console entries to buffer
        network: 100, // Network requests to buffer
      },
    }),
  ],

  server: {
    port: 5173,
    host: 'localhost',
  },
})
