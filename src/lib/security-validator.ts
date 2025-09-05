export interface DevSecurityOptions {
  isProduction?: boolean
  host?: string
  port?: number
}

const LOCALHOST = 'localhost'
const DEVTOOLS_PORT = 9222

// Simple denylist patterns to prevent obviously destructive operations
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\blocation\s*=\s*/i,
  /\blocation\.(assign|replace|reload)\s*\(/i,
  /\bdocument\.(write|open)\s*\(/i,
  /\bdocument\.cookie\s*=\s*/i,
  /\b(innerHTML|outerHTML)\s*=\s*/i,
  /\b(appendChild|removeChild|replaceChild|insertBefore)\s*\(/i,
  /\b(remove|append|prepend)\s*\(/i,
  /(localStorage|sessionStorage)\.(setItem|removeItem|clear)\s*\(/i,
  /\beval\s*\(/i,
  /new\s+Function\s*\(/i,
  /\bXMLHttpRequest\s*\(/i,
  /\bfetch\s*\(/i,
  /navigator\.sendBeacon\s*\(/i,
  /\bWebSocket\s*\(/i,
  /\bpostMessage\s*\(/i,
  /\bwindow\.close\s*\(/i,
]

export function ensureDevelopmentMode(opts: DevSecurityOptions): void {
  if (opts.isProduction) {
    throw new Error('security violation: plugin must only run in Vite development mode')
  }
}

export function validateLocalCDP(opts: DevSecurityOptions): void {
  const host = opts.host ?? LOCALHOST
  const port = opts.port ?? DEVTOOLS_PORT

  if (host !== LOCALHOST) {
    throw new Error(`security violation: CDP host must be '${LOCALHOST}' in development`)
  }
  if (port !== DEVTOOLS_PORT) {
    throw new Error(`security violation: CDP port must be ${DEVTOOLS_PORT} (localhost only)`)
  }
}

export function warnRemoteDebuggingRisks(): void {
  console.warn(
    'vite-plugin-cdp-mcp: Remote debugging exposes powerful browser control. Use ONLY on localhost in a trusted dev environment. Never expose port 9222 publicly.',
  )
}

export function isExpressionSafe(expression: string): boolean {
  const src = String(expression)
  return !DESTRUCTIVE_PATTERNS.some((re) => re.test(src))
}

export function assertExpressionSafe(expression: string): void {
  if (!isExpressionSafe(expression)) {
    throw new Error(
      'security violation: destructive operations are blocked in development (read-only debugging only)',
    )
  }
}
