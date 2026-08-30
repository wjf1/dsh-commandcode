/**
 * Update check — compares the installed plugin version against the latest
 * GitHub release and surfaces a hint in the settings page footer.
 */

import { PLUGIN_VERSION, PLUGIN_REPO } from './version.ts'

/** Cached latest version (checked once per session). */
let latestVersion: string | undefined
let checkInflight: Promise<string | undefined> | undefined

/**
 * Check for a newer version on GitHub.
 * Returns the latest version string, or undefined if the check fails or
 * the current version is up to date.
 */
export async function checkForUpdate(): Promise<string | undefined> {
  if (latestVersion !== undefined) {
    return isNewer(latestVersion, PLUGIN_VERSION) ? latestVersion : undefined
  }
  if (checkInflight !== undefined) return checkInflight

  checkInflight = (async (): Promise<string | undefined> => {
    try {
      const response = await fetch(`${PLUGIN_REPO}/releases/latest`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(8_000),
      })
      const tag = response.url.split('/tag/')[1]
      if (tag) {
        latestVersion = tag.replace(/^v/, '')
        return isNewer(latestVersion, PLUGIN_VERSION) ? latestVersion : undefined
      }
      return undefined
    } catch {
      return undefined
    }
  })()

  try {
    return await checkInflight
  } finally {
    checkInflight = undefined
  }
}

/** Simple semver-ish comparison (handles X.Y.Z and X.Y). */
function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const a = parse(latest)
  const b = parse(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av > bv) return true
    if (av < bv) return false
  }
  return false
}
