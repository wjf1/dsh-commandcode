/**
 * Friendly image-session error helper.
 *
 * The harness's image-session gate rejects with a generic
 * `model-unavailable` code when the selected model cannot run in an image
 * session. This helper recognizes that specific rejection so callers can
 * point the user at a Vision-capable Command Code model.
 */

/** Check whether an error is the image-session gate rejection. */
export function isImageSessionRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as Record<string, unknown>
  if (e.code !== 'model-unavailable') return false
  const message = typeof e.message === 'string' ? e.message : ''
  return message.includes('image') || message.includes('vision') || message.includes('session')
}
