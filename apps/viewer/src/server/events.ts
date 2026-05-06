/// <reference types="vite/client" />

type Client = { send: (event: string, data: string) => void; close: () => void }

// Guard against HMR module-reload in Vite dev: keep client Set on globalThis
// so it survives module hot-reloads without leaking connections.
declare global {
  // eslint-disable-next-line no-var
  var __assetEventClients: Set<Client> | undefined
}
const clients: Set<Client> = (globalThis.__assetEventClients ??= new Set())

export function addClient(c: Client): void {
  clients.add(c)
}

export function removeClient(c: Client): void {
  clients.delete(c)
}

/**
 * Broadcast a reload event to all connected SSE clients.
 * Clients whose `send` throws (because their controller was closed by the
 * peer or invalidated by HMR) are evicted from the registry — otherwise
 * dead entries accumulate across long dev sessions.
 */
export function broadcast(event: string, scope: string): void {
  for (const c of clients) {
    try {
      c.send(event, scope)
    } catch {
      clients.delete(c)
    }
  }
}

// Vite HMR: when this module is replaced, drop any stale closures so the
// next module instance starts with a clean registry. The /api/events route
// reconnects fresh streams on the new module.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const c of clients) {
      try {
        c.close()
      } catch {
        /* ignore */
      }
    }
    clients.clear()
  })
}
