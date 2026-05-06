/**
 * Vite plugin: asset watcher + SSE broadcast + TUI keyboard handler
 *
 * - Chokidar PRIMARY watcher (try/catch → fs.watch FALLBACK)
 * - Watches `<repo>/art/` exclusively (asset directories live there)
 * - Single 'all' scope; broadcasts via src/server/events.ts
 * - SVG→PNG via svg-bridge.ts on add/change of any .svg under art/
 * - TUI: q/r/c/s/o
 * - Bulk-convert at start if ASSET_VIEWER_CONVERT_ALL=1 or --convert-all
 */

import type { Plugin, ViteDevServer } from 'vite'
import { watch as fsWatch } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// apps/viewer/scripts/asset-watcher.plugin.ts → apps/viewer → apps → repo root
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const ART_ROOT = join(REPO_ROOT, 'art')
const PORT = 4321

declare global {
  // eslint-disable-next-line no-var
  var __assetPluginWatcher: { close: () => Promise<void> | void } | null | undefined
  // eslint-disable-next-line no-var
  var __assetPluginTuiActive: boolean | undefined
  // eslint-disable-next-line no-var
  var __assetPluginStdinBound: boolean | undefined
}

const TTY = process.stdout.isTTY && process.stdin.isTTY
const out = process.stdout

function tw(s: string) {
  if (TTY) out.write(s)
}

function colorize(code: string, str: string) {
  return out.isTTY ? `\x1b[${code}m${str}\x1b[0m` : str
}
const dim = (s: string) => colorize('2', s)
const lime = (s: string) => colorize('38;5;191', s)
const violet = (s: string) => colorize('38;5;141', s)
const cyan = (s: string) => colorize('36', s)
const yellow = (s: string) => colorize('33', s)

function drawHeader() {
  const cols = out.columns || 80
  tw('\x1b7')
  tw('\x1b[1;1H\x1b[2K')
  tw(violet('  ■ ASSET VIEWER  ') + dim(`http://localhost:${PORT}`))
  tw('\x1b[2;1H\x1b[2K')
  tw(dim('─'.repeat(cols)))
  tw('\x1b8')
}

function drawFooter() {
  const rows = out.rows || 24
  const cols = out.columns || 80
  const segs = [
    ` ${colorize('1;38;5;191', '[r]')} ${dim('restart')}`,
    ` ${colorize('1;38;5;191', '[o]')} ${dim('open in browser')}`,
    ` ${colorize('1;38;5;191', '[c]')} ${dim('clear')}`,
    ` ${colorize('1;38;5;191', '[s]')} ${dim('convert all svg→png')}`,
    ` ${colorize('1;38;5;191', '[q]')} ${dim('quit')}`,
  ].join(`  ${dim('·')}  `)
  const visible = segs.replace(/\x1b\[[^m]*m/g, '')
  const pad = Math.max(0, cols - visible.length)
  tw('\x1b7')
  tw(`\x1b[${rows};1H\x1b[2K`)
  tw('\x1b[48;5;236m')
  tw(segs + ' '.repeat(pad))
  tw('\x1b[0m')
  tw('\x1b8')
}

function drawFrame() {
  if (!TTY) return
  const rows = out.rows || 24
  tw('\x1b[2J')
  drawHeader()
  drawFooter()
  tw(`\x1b[3;${rows - 1}r`)
  tw('\x1b[3;1H')
}

function tuiEnter() {
  if (!TTY) return
  tw('\x1b[?1049h')
  tw('\x1b[?25l')
  drawFrame()
  globalThis.__assetPluginTuiActive = true
}

function tuiExit() {
  if (!TTY || !globalThis.__assetPluginTuiActive) return
  tw('\x1b[r')
  tw('\x1b[?25h')
  tw('\x1b[?1049l')
  globalThis.__assetPluginTuiActive = false
}

function clearLogs() {
  if (!TTY) return
  const rows = out.rows || 24
  for (let r = 3; r < rows; r++) tw(`\x1b[${r};1H\x1b[2K`)
  tw('\x1b[3;1H')
  drawFooter()
}

function relFromArt(absPath: string): string {
  return absPath.startsWith(ART_ROOT + '/') ? absPath.slice(ART_ROOT.length + 1) : absPath
}

function isIgnoredRel(rel: string): boolean {
  if (!rel) return true
  for (const part of rel.split('/')) {
    if (!part) continue
    if (part === '.DS_Store') return true
    if (part === '.archive') return true
    if (part === '_legacy') return true
    if (part.startsWith('.')) return true
  }
  return false
}

async function getBroadcast(): Promise<(event: string, scope: string) => void> {
  const mod = await import('../src/server/events.js')
  return mod.broadcast
}

async function getConvertSvg(): Promise<(absPath: string) => Promise<void>> {
  const mod = await import('../src/server/svg-bridge.js')
  return mod.convertSvg
}

async function getConvertAll(): Promise<(absPaths: string[]) => Promise<void>> {
  const mod = await import('../src/server/svg-bridge.js')
  return mod.convertAll
}

async function getScanScope(): Promise<
  (scope: string) => Promise<{ items: unknown[]; children: Map<string, unknown> }>
> {
  const mod = await import('../src/server/scan.js')
  return mod.scanScope as (
    scope: string,
  ) => Promise<{ items: unknown[]; children: Map<string, unknown> }>
}

function collectSvgPaths(
  tree: { items: Array<{ formats: Record<string, string> }>; children: Map<string, unknown> },
  scopeRoot: string,
): string[] {
  const paths: string[] = []
  function walk(node: {
    items: Array<{ formats: Record<string, string> }>
    children: Map<string, unknown>
  }) {
    for (const item of node.items) {
      if (item.formats.svg) {
        paths.push(resolve(scopeRoot, item.formats.svg))
      }
    }
    for (const child of node.children.values()) {
      walk(
        child as {
          items: Array<{ formats: Record<string, string> }>
          children: Map<string, unknown>
        },
      )
    }
  }
  walk(tree)
  return paths
}

export function assetWatcherPlugin(): Plugin {
  return {
    name: 'art-asset-watcher',
    apply: 'serve' as const,

    async configureServer(server: ViteDevServer) {
      if (globalThis.__assetPluginWatcher) {
        await globalThis.__assetPluginWatcher.close()
        globalThis.__assetPluginWatcher = null
      }

      const SCOPE = 'all'

      let watcherKind: 'chokidar' | 'fs.watch' = 'fs.watch'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let chokidarMod: any = null
      try {
        chokidarMod = await import('chokidar')
      } catch {
        // fall through
      }

      if (chokidarMod) {
        watcherKind = 'chokidar'
        const watcher = chokidarMod.watch(ART_ROOT, {
          ignored: (p: string) => {
            const rel = relFromArt(p)
            return isIgnoredRel(rel)
          },
          ignoreInitial: true,
          persistent: true,
          awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 25 },
        })

        const handleEvent = (event: 'add' | 'change' | 'unlink') => async (absPath: string) => {
          const rel = relFromArt(absPath)
          if (isIgnoredRel(rel)) return
          const tag = event === 'add' ? ' + ' : event === 'unlink' ? ' - ' : ' ~ '
          console.log(`${lime('●')} ${dim(tag)} ${cyan(rel)}`)

          if ((event === 'add' || event === 'change') && absPath.endsWith('.svg')) {
            try {
              const convertSvg = await getConvertSvg()
              await convertSvg(absPath)
            } catch (err: unknown) {
              console.warn(`  ⚠ svg→png failed: ${(err as Error).message}`)
            }
          }
          const broadcast = await getBroadcast()
          broadcast('reload', SCOPE)
        }

        watcher.on('add', handleEvent('add'))
        watcher.on('change', handleEvent('change'))
        watcher.on('unlink', handleEvent('unlink'))
        watcher.on('error', (err: Error) => console.warn('chokidar error:', err.message))

        globalThis.__assetPluginWatcher = {
          close: () => watcher.close(),
        }
      } else {
        watcherKind = 'fs.watch'
        const handles: Array<{ close: () => void }> = []

        try {
          const h = fsWatch(ART_ROOT, { recursive: true }, async (eventType, filename) => {
            if (!filename) return
            const rel = String(filename)
            if (isIgnoredRel(rel)) return

            console.log(`${lime('●')} ${dim(eventType === 'rename' ? '+/-' : ' ~ ')} ${cyan(rel)}`)
            const absPath = resolve(ART_ROOT, rel)

            if (rel.endsWith('.svg')) {
              try {
                const { stat } = await import('node:fs/promises')
                await stat(absPath)
                const convertSvg = await getConvertSvg()
                await convertSvg(absPath)
              } catch {
                // ENOENT or conversion error — ignore
              }
            }
            const broadcast = await getBroadcast()
            broadcast('reload', SCOPE)
          })
          handles.push({ close: () => h.close() })
        } catch {
          // art/ may not exist yet — fine, plugin still runs
        }

        globalThis.__assetPluginWatcher = {
          close: async () => {
            for (const h of handles) h.close()
          },
        }
      }

      console.log(`  ${violet('▸')} watching ${cyan(ART_ROOT)} via ${watcherKind}`)

      const CONVERT_ON_START =
        process.argv.includes('--convert-all') || process.env.ASSET_VIEWER_CONVERT_ALL === '1'

      if (CONVERT_ON_START) {
        console.log(`\n${yellow('⇢')} converting ALL svgs → png ${dim('(this may take a moment)')}`)
        try {
          const scanScope = await getScanScope()
          const convertAll = await getConvertAll()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tree = await scanScope(SCOPE as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allSvgPaths = collectSvgPaths(tree as any, ART_ROOT)
          await convertAll(allSvgPaths)
          console.log(`${lime('●')} bulk svg→png conversion complete\n`)
        } catch (err: unknown) {
          console.warn(`${yellow('!')} bulk conversion failed: ${(err as Error).message}`)
        }
      }

      if (TTY && !globalThis.__assetPluginStdinBound) {
        globalThis.__assetPluginStdinBound = true
        tuiEnter()
        out.on('resize', () => {
          if (globalThis.__assetPluginTuiActive) drawFrame()
        })

        try {
          if (process.stdin.setRawMode) process.stdin.setRawMode(true)
          process.stdin.resume()
          process.stdin.setEncoding('utf8')
          process.stdin.on('data', async (key: string) => {
            if (key === 'q' || key === '\u0003') {
              tuiExit()
              await server.close()
              process.exit(0)
            } else if (key === 'r') {
              console.log(`\n${lime('●')} ${dim('restarting Vite dev server…')}`)
              server.restart()
            } else if (key === 'c') {
              clearLogs()
            } else if (key === 's') {
              console.log(
                `\n${yellow('⇢')} converting ALL svgs → png ${dim('(this may take a moment)')}`,
              )
              try {
                const scanScope = await getScanScope()
                const convertAll = await getConvertAll()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tree = await scanScope(SCOPE as any)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const allSvgPaths = collectSvgPaths(tree as any, ART_ROOT)
                await convertAll(allSvgPaths)
                console.log(`${lime('●')} bulk svg→png conversion complete\n`)
              } catch (err: unknown) {
                console.warn(`${yellow('!')} bulk conversion failed: ${(err as Error).message}`)
              }
            } else if (key === 'o') {
              const url = `http://localhost:${PORT}`
              console.log(`\n${lime('●')} ${dim('opening')} ${cyan(url)}`)
              try {
                const opener =
                  process.platform === 'darwin'
                    ? 'open'
                    : process.platform === 'win32'
                      ? 'start'
                      : 'xdg-open'
                spawn(opener, [url], { stdio: 'ignore', detached: true }).unref()
              } catch (err: unknown) {
                console.warn(`${yellow('!')} open failed: ${(err as Error).message}`)
              }
            }
          })
        } catch (err: unknown) {
          console.warn('  ⚠ stdin raw mode failed:', (err as Error).message)
        }
      }

      server.httpServer?.on('close', async () => {
        if (globalThis.__assetPluginWatcher) {
          await globalThis.__assetPluginWatcher.close()
          globalThis.__assetPluginWatcher = null
        }
        if (TTY && process.stdin.setRawMode) {
          try {
            process.stdin.setRawMode(false)
          } catch {
            /* ok */
          }
        }
        tuiExit()
        globalThis.__assetPluginStdinBound = false
      })
    },

    async closeBundle() {
      if (globalThis.__assetPluginWatcher) {
        await globalThis.__assetPluginWatcher.close()
        globalThis.__assetPluginWatcher = null
      }
      if (TTY && process.stdin.setRawMode) {
        try {
          process.stdin.setRawMode(false)
        } catch {
          /* ok */
        }
      }
      tuiExit()
      globalThis.__assetPluginStdinBound = false
    },
  }
}
