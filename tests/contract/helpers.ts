import Ajv from 'ajv'
import mcpTools from '../../specs/001-docs-plan-md/contracts/mcp-tools.json' assert { type: 'json' }

const ajv = new Ajv({ allErrors: true })

// Pre-compile validators for performance
export const cdpRuntimeEvalInput = ajv.compile(mcpTools.tools['cdp.runtime.eval'].input)
export const cdpRuntimeEvalOutput = ajv.compile(mcpTools.tools['cdp.runtime.eval'].output)
export const cdpConsoleTailInput = ajv.compile(mcpTools.tools['cdp.console.tail'].input)
export const cdpConsoleTailOutput = ajv.compile(mcpTools.tools['cdp.console.tail'].output)
export const cdpNetworkTailInput = ajv.compile(mcpTools.tools['cdp.network.tail'].input)
export const cdpNetworkTailOutput = ajv.compile(mcpTools.tools['cdp.network.tail'].output)
export const healthEndpointInput = ajv.compile(mcpTools.tools['health'].input)
export const healthEndpointOutput = ajv.compile(mcpTools.tools['health'].output)


export function formatErrors(errors: typeof ajv.errors): string {
  if (!errors) return 'No errors'
  return errors
    .map((e) => `${e.instancePath || '/'} [${e.keyword}] ${e.message}`)
    .join(', ')
    .replace(/\"/g, '')
}
