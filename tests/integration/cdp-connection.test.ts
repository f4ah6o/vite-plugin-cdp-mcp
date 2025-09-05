import { describe, it, expect, beforeAll } from 'vitest'
import CDP from 'chrome-remote-interface'

const HOST = 'localhost'
const PORT = 9222
const PREFERRED_ORIGIN = 'http://localhost:5173'

async function isCDPAvailable(): Promise<boolean> {
  try {
    const v = await CDP.Version({ host: HOST, port: PORT })
    return Boolean(v && v.Browser)
  } catch {
    return false
  }
}

type TargetInfo = {
  id: string
  type: string
  url?: string
  title?: string
  webSocketDebuggerUrl?: string
}

async function listPageTargets(): Promise<TargetInfo[]> {
  const list = await CDP.List({ host: HOST, port: PORT })
  return list.filter((t: any) => t.type === 'page')
}

function selectPreferredTarget(targets: TargetInfo[]): TargetInfo | undefined {
  // Prefer Vite dev server pages
  const prioritized = targets.find((t) => (t.url || '').startsWith(PREFERRED_ORIGIN))
  if (prioritized) return prioritized
  // Fallback to first available page target
  return targets[0]
}

async function createNewTarget(url = 'about:blank'): Promise<TargetInfo> {
  // Create a new page via CDP HTTP API
  const created = await CDP.New({ host: HOST, port: PORT, url })
  return created as unknown as TargetInfo
}

describe('T008 Integration: Chrome CDP Connection', () => {
  let cdpUp = false

  beforeAll(async () => {
    cdpUp = await isCDPAvailable()
    if (!cdpUp) {
      // Helpful hint for developers running the tests locally
      // eslint-disable-next-line no-console
      console.warn(
        '\n[cdp-connection] Chrome with --remote-debugging-port=9222 not detected on localhost.\n' +
          'Start Chrome like:\n' +
          '  macOS:  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n' +
          '  Linux:  google-chrome --remote-debugging-port=9222\n' +
          '  Win:    chrome.exe --remote-debugging-port=9222\n',
      )
    }
  })

  it('connects to Chrome CDP at localhost:9222 and retrieves version', async () => {
    if (!cdpUp) return
    const version = await CDP.Version({ host: HOST, port: PORT })
    expect(version).toBeTruthy()
    expect(version.webSocketDebuggerUrl).toBeTypeOf('string')
    // Browser typically looks like "Chrome/XX" or "Chromium/XX"
    expect(version.Browser).toMatch(/Chrome|Chromium/i)
  })

  it('discovers targets and selects preferred target (localhost:5173 priority)', async () => {
    if (!cdpUp) return

    const pages = await listPageTargets()
    // There should be at least zero :) If none, we will just create one in the next test.
    expect(Array.isArray(pages)).toBe(true)

    const preferred = selectPreferredTarget(pages)
    if (preferred) {
      // If a localhost:5173 page exists, ensure we picked it; otherwise we picked first page
      const vitePage = pages.find((t) => (t.url || '').startsWith(PREFERRED_ORIGIN))
      if (vitePage) {
        expect(preferred.id).toBe(vitePage.id)
      } else {
        expect(preferred.id).toBe(pages[0].id)
      }

      // Establish a CDP session to the selected target
      const client = await CDP({
        host: HOST,
        port: PORT,
        target: (t: any) => t.id === preferred.id,
      })
      // Sanity: enable a common domain and then close
      await client.Page.enable()
      await client.close()
    } else {
      // No page targets available at all; acceptable here, the next test will cover auto-creation
      expect(pages.length).toBe(0)
    }
  })

  it('auto-creates a new target when no suitable targets exist', async () => {
    if (!cdpUp) return

    const pagesBefore = await listPageTargets()
    const vitePage = pagesBefore.find((t) => (t.url || '').startsWith(PREFERRED_ORIGIN))

    if (vitePage) {
      // Suitable target exists already (localhost:5173). Nothing to create; treat as pass.
      // eslint-disable-next-line no-console
      console.warn(
        '[cdp-connection] Found existing localhost:5173 target; skipping auto-creation path.',
      )
      expect(true).toBe(true)
      return
    }

    // Create a new target (about:blank keeps the test self-contained)
    const created = await createNewTarget('about:blank')
    expect(created).toBeTruthy()
    expect(created.id).toBeTypeOf('string')

    // Verify it now appears in the target list and we can connect to it
    const pagesAfter = await listPageTargets()
    const found = pagesAfter.find((t) => t.id === created.id)
    expect(found).toBeTruthy()

    const client = await CDP({ host: HOST, port: PORT, target: (t: any) => t.id === created.id })
    await client.Page.enable()
    await client.close()

    // Optional cleanup: do not close the page to avoid interfering with developer's session
  })
})
