# Release v0.1.0

This is the first public release of `vite-plugin-cdp-mcp`.

## What’s new

- Integrates Chrome DevTools Protocol (CDP) with Model Context Protocol (MCP) during Vite development
- MCP server mounted at `/mcp` via Streamable HTTP transport
- Tools:
  - `cdp.console.tail` — recent console entries with filters
  - `cdp.network.tail` — recent network requests with filters
  - `cdp.runtime.eval` — evaluate JavaScript in browser context (safe defaults)
- Graceful fallbacks when Chrome is not available (dev UX-first)

## Build & Tooling

- pnpm-based setup (`packageManager: pnpm`)
- `tsup` build: CJS + ESM bundles with type definitions
- CI: pnpm install → lint/check → test → build
- Publish workflow: triggers on tag push (`v*.*.*`), Release publish, or manual dispatch

## Quality

- Test suites stabilized; 112 tests passing across contract, unit, integration, performance

## Security notes

- Development-only; CDP connections restricted to `localhost:9222`
- Remote debugging is powerful — never expose the port publicly

## Install & Use (quick)

```bash
pnpm add -D vite-plugin-cdp-mcp
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import cdpMcpPlugin from 'vite-plugin-cdp-mcp'

export default defineConfig({
  plugins: [
    cdpMcpPlugin({
      port: 9222,
      mcpPath: '/mcp',
      bufferSize: { console: 1000, network: 100 },
    }),
  ],
})
```

Start Chrome with `--remote-debugging-port=9222` and then:

```bash
pnpm dev
```

