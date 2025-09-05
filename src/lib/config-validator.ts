export interface BufferSizeConfig {
  console?: number
  network?: number
}

export interface PluginConfig {
  port?: number
  mcpPath?: string
  bufferSize?: BufferSizeConfig
}

export interface NormalizedPluginConfig {
  port: number
  mcpPath: string
  bufferSize: {
    console: number
    network: number
  }
}

export const DEFAULTS: NormalizedPluginConfig = {
  port: 9222,
  mcpPath: '/mcp',
  bufferSize: {
    console: 1000,
    network: 100,
  },
}

const PORT_MIN = 1
const PORT_MAX = 65535

// Based on data model spec capacities
const CONSOLE_BUFFER_MAX = 1000
const NETWORK_BUFFER_MAX = 100

function toInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  return undefined
}

function normalizePath(path: unknown): string {
  if (typeof path !== 'string' || path.trim() === '') return DEFAULTS.mcpPath
  let p = path.trim()
  // Ensure leading slash
  if (!p.startsWith('/')) p = `/${p}`
  // Collapse multiple slashes and remove trailing slash (except root)
  p = p.replace(/\/+/, '/').replace(/\/$/, '')
  return p || DEFAULTS.mcpPath
}

function validatePort(port: unknown, warnings: string[]): number {
  const n = toInt(port)
  if (n === undefined) {
    warnings.push(`Invalid port value; using default ${DEFAULTS.port}`)
    return DEFAULTS.port
  }
  if (n < PORT_MIN || n > PORT_MAX) {
    warnings.push(
      `Port ${n} out of range (${PORT_MIN}-${PORT_MAX}); using default ${DEFAULTS.port}`,
    )
    return DEFAULTS.port
  }
  return n
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function validateBufferSizes(
  input: BufferSizeConfig | undefined,
  warnings: string[],
): {
  console: number
  network: number
} {
  const result = { ...DEFAULTS.bufferSize }

  if (input && input.console !== undefined) {
    const n = toInt(input.console)
    if (n === undefined || n <= 0) {
      warnings.push(`Invalid console buffer size; using default ${DEFAULTS.bufferSize.console}`)
    } else {
      const clamped = clamp(n, 1, CONSOLE_BUFFER_MAX)
      if (clamped !== n) {
        warnings.push(`Console buffer size ${n} exceeds limit; clamped to ${clamped}`)
      }
      result.console = clamped
    }
  }

  if (input && input.network !== undefined) {
    const n = toInt(input.network)
    if (n === undefined || n <= 0) {
      warnings.push(`Invalid network buffer size; using default ${DEFAULTS.bufferSize.network}`)
    } else {
      const clamped = clamp(n, 1, NETWORK_BUFFER_MAX)
      if (clamped !== n) {
        warnings.push(`Network buffer size ${n} exceeds limit; clamped to ${clamped}`)
      }
      result.network = clamped
    }
  }

  return result
}

export function validatePluginConfig(userConfig: PluginConfig = {}): {
  config: NormalizedPluginConfig
  warnings: string[]
} {
  const warnings: string[] = []

  const port = validatePort(userConfig.port, warnings)
  const mcpPath = normalizePath(userConfig.mcpPath)
  if (userConfig.mcpPath && mcpPath !== userConfig.mcpPath) {
    warnings.push(`Normalized mcpPath to '${mcpPath}'`)
  }

  const bufferSize = validateBufferSizes(userConfig.bufferSize, warnings)

  return {
    config: {
      port,
      mcpPath,
      bufferSize,
    },
    warnings,
  }
}
