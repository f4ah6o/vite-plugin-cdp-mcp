## v0.1.0 (2025-09-05)

Initial release of `vite-plugin-cdp-mcp`.

Highlights:
- Vite dev plugin that mounts an MCP server at `/mcp` and integrates with Chrome DevTools Protocol (CDP)
- Three MCP tools: `cdp.console.tail`, `cdp.network.tail`, `cdp.runtime.eval`
- Streamable HTTP transport (MCP) behind Vite middleware
- Graceful fallbacks when Chrome is unavailable
- Zod/Ajv schema alignment and robust validation
- Circular buffers for console/network data

Tooling and build:
- pnpm migration (`packageManager: pnpm`)
- CI on GitHub Actions (pnpm install → check → test → build)
- Publish workflow (tag push / release publish / manual)
- Build via `tsup` (CJS + ESM + d.ts to `dist/`)

Quality:
- Tests: 112/112 pass (contract, unit, integration, performance)

Security & scope:
- Development-only; restricted to localhost CDP (`localhost:9222`)
- Read-only debugging; destructive actions are not provided

Breaking changes: None

