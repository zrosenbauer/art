/**
 * Cross-cutting magic numbers, named once.
 */

/** Port the dev viewer binds to. Must match the chokidar/SSE wiring. */
export const VIEWER_PORT = 4321

/** How long the HMR flash badge stays visible after a `reload` event. */
export const FLASH_DURATION_MS = 600

/** Manual reconnect delay when EventSource gives up (CLOSED state). */
export const RECONNECT_BACKOFF_MS = 300

/** Localstorage key used by ThemeToggle + the inline FOUC-prevention script. */
export const THEME_STORAGE_KEY = 'art-theme'
