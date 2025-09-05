// Main entry point for the vite-plugin-cdp-mcp
export { default } from './lib/vite-plugin-cdp-mcp.js'

// Export types for TypeScript users
export type { PluginConfig } from './lib/vite-plugin-cdp-mcp.js'

// Export models for advanced usage
export * from './models/console-entry.js'
export * from './models/network-request.js'
export * from './models/runtime-evaluation.js'
export * from './models/browser-target.js'
