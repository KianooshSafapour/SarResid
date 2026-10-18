import { spawn, type ChildProcess } from 'child_process'

/**
 * Supervisor for the realtime service.
 *
 * `bun run dev` runs this supervisor, which spawns `bun --hot index.ts`
 * (hot-reload on file change) and restarts the server process if it exits
 * unexpectedly (the shared sandbox has an active OOM-killer — the service
 * must be able to come back by itself).
 */

process.title = 'sarresid-realtime-sup'

let child: ChildProcess | null = null
let stopping = false
let restarts = 0

async function healthy(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:3031/health', {
      signal: AbortSignal.timeout(800),
    })
    return res.ok
  } catch {
    return false
  }
}

async function start() {
  if (stopping) return
  if (await healthy()) {
    console.log('[supervisor] another instance already serves :3030/:3031 — standing down')
    process.exit(0)
  }
  child = spawn('bun', ['--hot', 'index.ts'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  })
  child.on('exit', async (code, signal) => {
    if (stopping) return
    // if someone else (another supervisor) took the ports, stand down
    if (await healthy()) {
      console.log('[supervisor] ports already served by another instance — standing down')
      process.exit(0)
    }
    restarts++
    const delay = Math.min(2000 * restarts, 15000)
    console.log(
      `[supervisor] realtime server exited (code=${code} signal=${signal}) — restart #${restarts} in ${delay / 1000}s`
    )
    setTimeout(start, delay)
  })
}

process.on('SIGTERM', () => {
  stopping = true
  child?.kill('SIGTERM')
  setTimeout(() => process.exit(0), 500)
})
process.on('SIGINT', () => {
  stopping = true
  child?.kill('SIGINT')
  setTimeout(() => process.exit(0), 500)
})

console.log('[supervisor] starting sarresid realtime service')
start()
