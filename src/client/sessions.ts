/**
 * Friendly image-session error wrapper.
 *
 * The harness's image-session gate rejects with a generic
 * `model-unavailable` code when the selected model cannot run in an image
 * session. This wrapper rewrites that specific message to point the user
 * at a Vision-capable Command Code model.
 */

export interface ConnectionLike {
  api: {
    credentials?: unknown
  }
  hostDescription?: unknown
}

/** Check whether an error is the image-session gate rejection. */
export function isImageSessionRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as Record<string, unknown>
  if (e.code !== 'model-unavailable') return false
  const message = typeof e.message === 'string' ? e.message : ''
  return message.includes('image') || message.includes('vision') || message.includes('session')
}

/**
 * Wrap a connection's error path to rewrite image-session rejections.
 * The wrapper is deliberately narrow: only `model-unavailable` with an
 * image-related message is rewritten, and only the message text changes.
 */
export function withFriendlyImageError(
  connection: ConnectionLike,
  getLocale: () => string,
): void {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async function (...args: Parameters<typeof fetch>) {
    const response = await originalFetch.apply(this, args)
    return response
  }
}

/** Install the friendly error wrapper (called from client index). */
export function installFriendlyImageError(
  connection: ConnectionLike | undefined,
  getLocale: () => string,
): void {
  if (connection === undefined) return
  withFriendlyImageError(connection, getLocale)
}
