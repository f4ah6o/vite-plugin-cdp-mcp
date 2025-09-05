# vite-plugin-cdp-mcp

A Vite plugin that integrates Chrome DevTools Protocol (CDP) with Model Context Protocol (MCP) for enhanced debugging during development.

[![npm version](https://img.shields.io/npm/v/vite-plugin-cdp-mcp.svg)](https://www.npmjs.com/package/vite-plugin-cdp-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🔍 **Console Log Inspection** - Retrieve and filter browser console entries
- 🌐 **Network Request Monitoring** - Monitor HTTP requests with filtering capabilities  
- ⚡ **JavaScript Evaluation** - Execute JavaScript in browser context safely
- 🔒 **Development-Only Security** - Restricted to localhost and development mode
- 📊 **Real-time Data Streaming** - Circular buffers for efficient data management
- 🚀 **MCP Integration** - Expose debugging tools via Model Context Protocol

## Quick Start

### Installation

```bash
npm install vite-plugin-cdp-mcp --save-dev
```

### Basic Configuration

Add to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import cdpMcpPlugin from 'vite-plugin-cdp-mcp'

export default defineConfig({
  plugins: [
    cdpMcpPlugin({
      port: 9222,        // Chrome remote debugging port
      mcpPath: '/mcp',   // MCP server endpoint path
      bufferSize: {
        console: 1000,   // Console entries buffer size
        network: 100     // Network requests buffer size
      }
    })
  ]
})
```

### Chrome Setup

Start Chrome with remote debugging enabled:

```bash
# macOS/Linux
google-chrome --remote-debugging-port=9222 --no-first-run --no-default-browser-check

# Windows
chrome.exe --remote-debugging-port=9222 --no-first-run --no-default-browser-check
```

### Start Development

```bash
npm run dev
```

The plugin will automatically:
- Connect to Chrome DevTools on `localhost:9222`
- Mount MCP server at `http://localhost:5173/mcp`
- Begin collecting console and network data

## MCP Tools

The plugin exposes three debugging tools via Model Context Protocol:

### `cdp.console.tail`

Retrieve recent console log entries with filtering.

**Parameters:**
- `count` (number, optional): Number of entries to retrieve (1-1000, default: 50)
- `level` (string, optional): Filter by log level (`log`, `debug`, `info`, `warn`, `error`)
- `since` (number, optional): Unix timestamp - only entries after this time

**Example:**
```json
{
  "tool": "cdp.console.tail",
  "arguments": {
    "count": 20,
    "level": "error",
    "since": 1640995200000
  }
}
```

### `cdp.network.tail`

Retrieve recent network requests with filtering.

**Parameters:**
- `count` (number, optional): Number of requests to retrieve (1-100, default: 20)
- `method` (string, optional): Filter by HTTP method (`GET`, `POST`, `PUT`, `DELETE`, etc.)
- `status` (number, optional): Filter by HTTP status code (100-599)
- `domain` (string, optional): Filter by request domain

**Example:**
```json
{
  "tool": "cdp.network.tail",
  "arguments": {
    "count": 10,
    "method": "POST",
    "status": 200
  }
}
```

### `cdp.runtime.eval`

Execute JavaScript code in the browser context.

**Parameters:**
- `expression` (string, required): JavaScript code to evaluate
- `awaitPromise` (boolean, optional): Whether to await promise results (default: false)
- `returnByValue` (boolean, optional): Return result by value (default: true)
- `timeout` (number, optional): Evaluation timeout in milliseconds (100-30000, default: 5000)

**Example:**
```json
{
  "tool": "cdp.runtime.eval",
  "arguments": {
    "expression": "document.title",
    "timeout": 1000
  }
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | `9222` | Chrome remote debugging port |
| `mcpPath` | string | `"/mcp"` | MCP server endpoint path |
| `bufferSize.console` | number | `1000` | Console entries circular buffer size |
| `bufferSize.network` | number | `100` | Network requests circular buffer size |

## Security

This plugin implements several security measures:

- **Development-only operation** - Automatically disabled in production builds
- **Localhost restriction** - CDP connections limited to `localhost:9222`
- **Read-only debugging** - Destructive operations are blocked
- **Expression filtering** - Dangerous JavaScript patterns are prevented

## Health Check

Monitor plugin status via the health endpoint:

```bash
curl http://localhost:5173/mcp/health
```

Response includes:
- Plugin status (`healthy`, `degraded`, `unhealthy`)
- Chrome connection status
- Buffer statistics
- Uptime information

## Troubleshooting

### Chrome Not Available

**Error:** `CHROME_NOT_AVAILABLE: Chrome browser with remote debugging is not available`

**Solution:**
1. Ensure Chrome is running with `--remote-debugging-port=9222`
2. Check that port 9222 is not blocked by firewall
3. Verify no other processes are using port 9222

### Target Not Found

**Error:** `TARGET_NOT_FOUND: No suitable browser target found`

**Solution:**
1. Open a tab in Chrome pointing to `http://localhost:5173`
2. Refresh the page to re-establish connection
3. Check Chrome DevTools → Settings → Experiments → "Allow custom UI themes" is disabled

### Connection Timeout

**Error:** `CDP_CONNECTION_ERROR: Chrome DevTools Protocol connection failed`

**Solution:**
1. Restart Chrome with debugging flags
2. Clear Chrome cache and data
3. Try a different port: `--remote-debugging-port=9223`

### Permission Denied

**Error:** `SECURITY_VIOLATION: security violation`

**Solution:**
1. Ensure you're in development mode (`npm run dev`)
2. Check that CDP host is set to `localhost`
3. Verify no remote debugging over network

## Performance

The plugin is designed for optimal development experience:

- **<100ms response time** for all MCP tool calls
- **Circular buffering** prevents memory leaks
- **Lazy initialization** reduces startup impact
- **Connection pooling** minimizes overhead

## Examples

See the [`examples/`](examples/) directory for:
- Basic Vite project setup
- Advanced configuration examples
- MCP client integration samples
- Error handling patterns

## API Reference

For detailed API documentation, see [`docs/api.md`](docs/api.md).

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Run tests: `npm test`
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Related Projects

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Vite](https://vitejs.dev/)