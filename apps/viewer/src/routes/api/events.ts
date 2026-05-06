import { createFileRoute } from '@tanstack/react-router'
import { addClient, removeClient } from '@/server/events'

export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const encoder = new TextEncoder()
        let heartbeat: ReturnType<typeof setInterval> | null = null

        // Declare client outside start() so cancel() can reference it via closure
        let client: { send: (event: string, data: string) => void; close: () => void } | null = null

        const cleanup = () => {
          if (heartbeat) {
            clearInterval(heartbeat)
            heartbeat = null
          }
          if (client) {
            removeClient(client)
            client = null
          }
        }

        const stream = new ReadableStream({
          start(controller) {
            const send = (event: string, data: string) => {
              try {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
              } catch {
                // ignore
              }
            }
            client = {
              send,
              close: () => {
                try {
                  controller.close()
                } catch {
                  // ignore
                }
              },
            }
            addClient(client)
            // Send retry hint (250ms reconnect interval, mirrors legacy asset-viewer.mjs)
            try {
              controller.enqueue(encoder.encode('retry: 250\n'))
            } catch {
              // ignore
            }
            // Send initial connected ping
            send('connected', '')

            // Heartbeat every 15s to keep connection alive through proxies
            heartbeat = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(': hb\n\n'))
              } catch {
                // ignore
              }
            }, 15000)

            // Clean up when client disconnects via request abort signal
            request.signal.addEventListener('abort', () => {
              cleanup()
              try {
                controller.close()
              } catch {
                // ignore
              }
            })
          },
          // Belt-and-suspenders: also clean up if the stream is cancelled from
          // the consumer side (e.g. tab close) without the abort signal firing.
          cancel() {
            cleanup()
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no', // prevent nginx buffering
          },
        })
      },
    },
  },
})
