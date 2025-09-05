// Main entry point for the vite-plugin-cdp-mcp
export { default } from './lib/vite-plugin-cdp-mcp.js'

// Export types for TypeScript users
export type { PluginConfig } from './lib/vite-plugin-cdp-mcp.js'

// Internal models are not re-exported to avoid name collisions in public API.
// Import directly from subpaths if needed.
