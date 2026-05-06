import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { FLASH_DURATION_MS, RECONNECT_BACKOFF_MS } from '@/lib/constants'

export interface ReloadStream {
  /**
   * True for ~600ms after a matching `reload` event arrives — wire this
   * to the HMR flash badge for visual feedback.
   */
  isFlashing: boolean
}

/**
 * Subscribe to the SSE /api/events stream.
 * When a 'reload' event arrives whose scope matches our current scope,
 * invalidate the router so loaders re-fetch and pulse `isFlashing`.
 *
 * On reconnect after disconnect (server restarted), also invalidates and
 * pulses.
 *
 * Mirrors asset-viewer.client.js setupHmr() (lines 252–316), but uses
 * TanStack Router's router.invalidate() instead of location.replace().
 */
export function useReloadStream(scope: string): ReloadStream {
  const router = useRouter()
  const wasOpenRef = useRef(false)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isFlashing, setIsFlashing] = useState(false)

  useEffect(() => {
    let active = true

    function pulse() {
      setIsFlashing(true)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setIsFlashing(false), FLASH_DURATION_MS)
    }

    function connect() {
      if (!active) return
      // Close any existing EventSource before opening a new one. Native
      // EventSource auto-reconnects on transient errors AND we manually
      // schedule a reconnect when readyState=CLOSED — without this guard
      // the two paths can race and leak parallel connections.
      esRef.current?.close()
      const es = new EventSource('/api/events')
      esRef.current = es

      es.addEventListener('open', () => {
        if (wasOpenRef.current) {
          router.invalidate()
          pulse()
        }
        wasOpenRef.current = true
      })

      es.addEventListener('reload', (e: MessageEvent<string>) => {
        if (e.data === scope) {
          router.invalidate()
          pulse()
        }
      })

      es.addEventListener('error', () => {
        if (es.readyState === EventSource.CLOSED) {
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_BACKOFF_MS)
        }
      })
    }

    connect()

    return () => {
      active = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      esRef.current?.close()
      esRef.current = null
    }
  }, [scope, router])

  return { isFlashing }
}
