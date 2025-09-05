# API Reference

This document provides detailed API reference for vite-plugin-cdp-mcp.

## Plugin Factory

### `cdpMcpPlugin(config?: PluginConfig): Plugin`

Creates a Vite plugin instance with CDP-MCP integration.

**Parameters:**
- `config` (PluginConfig, optional): Plugin configuration options

**Returns:** Vite Plugin instance

**Example:**
```typescript
import cdpMcpPlugin from 'vite-plugin-cdp-mcp'

const plugin = cdpMcpPlugin({
  port: 9222,
  mcpPath: '/debug',
  bufferSize: {
    console: 500,
    network: 50
  }
})
```

## Configuration Types

### `PluginConfig`

Main plugin configuration interface.

```typescript
interface PluginConfig {
  port?: number;           // Chrome debugging port (default: 9222)
  mcpPath?: string;        // MCP endpoint path (default: "/mcp")
  bufferSize?: BufferSizeConfig;
}
```

### `BufferSizeConfig`

Buffer size configuration for data collection.

```typescript
interface BufferSizeConfig {
  console?: number;        // Console entries buffer (default: 1000)
  network?: number;        // Network requests buffer (default: 100)
}
```

## Data Models

### `ConsoleEntry`

Represents a browser console log entry.

```typescript
interface ConsoleEntry {
  level: 'log' | 'debug' | 'info' | 'warn' | 'error';
  timestamp: number;       // Unix timestamp in milliseconds
  message: string;         // Formatted console message
  source: string;          // Source file location or "unknown"
}
```

**State Machine:**
- `Created` → `Buffered` → `Streamed`

### `NetworkRequest`

Represents an HTTP request captured from the browser.

```typescript
interface NetworkRequest {
  requestId: string;             // Unique CDP request identifier
  url: string;                   // Full request URL
  method: HttpMethod;            // HTTP method
  status?: number;               // HTTP status code (undefined if pending)
  origin: string;                // Request origin/referrer
  timestamp: number;             // Request start time
  duration?: number;             // Request duration in ms
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string>;
  failed: boolean;               // True if request failed
}
```

**State Machine:**
- `Created` → `Updated` → `Completed`/`Failed`

### `RuntimeEvaluation`

Represents a JavaScript evaluation request and result.

```typescript
interface RuntimeEvaluation {
  id: string;                    // Unique evaluation identifier
  expression: string;            // JavaScript code evaluated
  timestamp: number;             // Evaluation start time
  result?: any;                  // Evaluation result (XOR with error)
  error?: string;                // Error message if failed (XOR with result)
  consoleOutput: ConsoleEntry[]; // Console logs during evaluation
  duration: number;              // Evaluation time in milliseconds
}
```

**State Machine:**
- `Created` → `Executed` → `Completed`/`Failed`

### `BrowserTarget`

Represents a Chrome browser tab/window connection.

```typescript
interface BrowserTarget {
  id: string;                    // CDP target identifier
  url: string;                   // Target page URL
  title: string;                 // Page title
  type: 'page' | 'background_page' | 'service_worker' | 'other';
  attached: boolean;             // Whether attached to this target
  canAttach: boolean;            // Whether target supports attachment
  lastActivity: number;          // Last interaction timestamp
}
```

**State Machine:**
- `Discovered` → `Attached` → `Active` → `Detached`

## MCP Tools API

### Console Tool: `cdp.console.tail`

Retrieve recent console log entries with optional filtering.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "count": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000,
      "default": 50,
      "description": "Number of recent console entries to retrieve"
    },
    "level": {
      "type": "string",
      "enum": ["log", "debug", "info", "warn", "error"],
      "description": "Filter by console log level (optional)"
    },
    "since": {
      "type": "integer",
      "description": "Unix timestamp - only return entries after this time (optional)"
    }
  },
  "additionalProperties": false
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "entries": {
      "type": "array",
      "items": { /* ConsoleEntry schema */ }
    },
    "totalCount": {
      "type": "integer",
      "description": "Total number of entries matching filter"
    },
    "target": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "url": {"type": "string"},
        "title": {"type": "string"}
      }
    }
  },
  "required": ["entries", "totalCount", "target"]
}
```

### Network Tool: `cdp.network.tail`

Retrieve recent network request information with filtering.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "count": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20,
      "description": "Number of recent network requests to retrieve"
    },
    "method": {
      "type": "string",
      "enum": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
      "description": "Filter by HTTP method (optional)"
    },
    "status": {
      "type": "integer",
      "minimum": 100,
      "maximum": 599,
      "description": "Filter by HTTP status code (optional)"
    },
    "domain": {
      "type": "string",
      "description": "Filter by request domain (optional)"
    }
  },
  "additionalProperties": false
}
```

### Runtime Tool: `cdp.runtime.eval`

Execute JavaScript code in Chrome browser context.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "expression": {
      "type": "string",
      "minLength": 1,
      "description": "JavaScript code to evaluate in browser context"
    },
    "awaitPromise": {
      "type": "boolean",
      "default": false,
      "description": "Whether to await promise results"
    },
    "returnByValue": {
      "type": "boolean",
      "default": true,
      "description": "Whether to return result by value or object reference"
    },
    "timeout": {
      "type": "integer",
      "minimum": 100,
      "maximum": 30000,
      "default": 5000,
      "description": "Evaluation timeout in milliseconds"
    }
  },
  "required": ["expression"],
  "additionalProperties": false
}
```

## Error Codes

The plugin uses standardized error codes for consistent error handling:

| Error Code | Description | Common Causes |
|------------|-------------|---------------|
| `CHROME_NOT_AVAILABLE` | Chrome browser not accessible | Chrome not started with debugging flags |
| `TARGET_NOT_FOUND` | No suitable browser target | No tabs open or wrong URL |
| `EVALUATION_TIMEOUT` | JavaScript evaluation timed out | Long-running or infinite loop code |
| `EVALUATION_ERROR` | JavaScript evaluation failed | Syntax error or runtime exception |
| `CDP_CONNECTION_ERROR` | CDP connection failed | Network issues or Chrome crashed |
| `INVALID_CONFIGURATION` | Invalid plugin configuration | Wrong port or malformed options |
| `SECURITY_VIOLATION` | Security policy violation | Non-localhost connection or destructive operation |

## Security API

### Expression Safety

The plugin automatically filters dangerous JavaScript patterns:

```typescript
// Blocked patterns (examples)
location = "evil.com"           // Navigation hijacking
document.write("<script>")      // DOM manipulation  
eval("malicious code")          // Dynamic code execution
fetch("https://attacker.com")   // External requests
localStorage.setItem()          // Storage manipulation
```

### Development-Only Enforcement

```typescript
// Plugin automatically detects production mode
if (isProduction) {
  throw new Error('Plugin disabled in production')
}

// Validates localhost-only connections
if (host !== 'localhost') {
  throw new Error('CDP connections restricted to localhost')
}
```

## Performance API

### Buffer Management

Circular buffers automatically manage memory usage:

```typescript
// Console buffer (FIFO, 1000 entries max)
const consoleBuffer = new CircularBuffer<ConsoleEntry>(1000)

// Network buffer (FIFO, 100 entries max)  
const networkBuffer = new CircularBuffer<NetworkRequest>(100)

// Query with automatic filtering and pagination
const entries = bufferManager.queryConsoleEntries({
  count: 50,
  level: 'error',
  since: Date.now() - 60000  // Last minute
})
```

### Connection Management

```typescript
// Lazy initialization with retry logic
const cdpClient = new CDPClient({
  port: 9222,
  host: 'localhost'
})

// Exponential backoff retry
await cdpClient.connect()  // Auto-retries on failure

// Target selection priority:
// 1. localhost:5173 (Vite dev server)
// 2. Any localhost target
// 3. Any attachable target
```

## Logging API

Structured JSON logging with context:

```typescript
const logger = new Logger({
  service: 'CDPClient',
  method: 'connect',
  targetId: 'target-123'
})

logger.info('Connection established', { 
  duration: '1.2ms',
  targetUrl: 'http://localhost:5173'
})

// Output:
// {
//   "timestamp": "2024-01-01T12:00:00.000Z",
//   "level": "info", 
//   "message": "Connection established",
//   "service": "CDPClient",
//   "method": "connect",
//   "targetId": "target-123",
//   "extra": {
//     "duration": "1.2ms",
//     "targetUrl": "http://localhost:5173"
//   }
// }
```

## Health Check API

### Endpoint: `GET /mcp/health`

Returns plugin health status and diagnostics.

**Response:**
```json
{
  "status": "healthy",
  "chrome": {
    "connected": true,
    "version": "120.0.6099.109",
    "targets": 3
  },
  "plugin": {
    "version": "0.1.0",
    "uptime": 120000
  },
  "buffers": {
    "console": { "size": 245, "capacity": 1000 },
    "network": { "size": 18, "capacity": 100 }
  }
}
```

**Status Values:**
- `healthy`: All systems operational
- `degraded`: Some features limited (e.g., Chrome disconnected)  
- `unhealthy`: Critical failures preventing operation

## Extension Points

### Custom Error Mapping

```typescript
import { ErrorHandler, ErrorCode } from 'vite-plugin-cdp-mcp'

// Extend error detection
const customError = ErrorHandler.mapError(error)
if (customError.message.includes('custom-condition')) {
  // Handle custom error types
}
```

### Buffer Events

```typescript
import { BufferManager } from 'vite-plugin-cdp-mcp'

const bufferManager = new BufferManager(config)

// Listen for buffer events
bufferManager.onBufferFull('console', () => {
  console.warn('Console buffer reached capacity')
})
```

## Migration Guide

### From v0.0.x to v0.1.x

- Configuration API remains backward compatible
- New security restrictions may block previously allowed operations
- MCP tool schemas are now strictly validated
- Performance improvements require no code changes