// Runs analyze() in the worker from analysisWorker.ts, with a
// main-thread fallback: if Workers are unavailable, the worker
// fails to start, or a request errors or times out, the same
// analyser runs on the main thread and returns the same result. The
// UI never sees the difference, only the thread the work ran on.
//
// Website analysis does NOT go through the worker:
// analyzeSite() needs DOMParser, which does not exist in a worker,
// so every site scan sent here threw and fell back anyway (F2).
// analyzeSiteAsync runs analyzeSite() on the main thread directly —
// the same result the fallback always produced, without the doomed
// round-trip. Only copy analysis (the paste path) runs off-thread.
//
// A request that never answers falls back after WORKER_TIMEOUT_MS
// instead of hanging the scan: the worker is slow to fail in some
// environments, and a scan that silently never finishes is worse
// than a scan on the main thread.

import { analyze, type Analysis } from './analyzer'
import {
  handleAnalysisRequest,
  type AnalysisRequest,
  type AnalysisResponse,
} from './analysisWorker'
import { analyzeSite, type SiteAnalysis, type SiteSource } from './siteAnalyzer'

export const WORKER_TIMEOUT_MS = 10000

type WorkerFactory = () => Worker | null

interface Pending {
  resolve: (response: AnalysisResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

// Test seam: tests inject a fake worker (driven by
// handleAnalysisRequest) to exercise the message plumbing, or null
// to force the main-thread fallback, or undefined to clear the
// override and decide from the environment again. Production code
// never sets it.
let workerFactoryOverride: WorkerFactory | null | undefined
let worker: Worker | null = null
let workerBroken = false
let nextId = 1
const pending = new Map<number, Pending>()

export const setAnalysisWorkerFactory = (
  factory: WorkerFactory | null | undefined,
): void => {
  workerFactoryOverride = factory
  resetAnalysisWorker()
}

export const resetAnalysisWorker = (): void => {
  for (const [, item] of pending) {
    clearTimeout(item.timer)
    item.reject(new Error('The analysis worker was reset.'))
  }
  pending.clear()
  if (worker) {
    try {
      worker.terminate()
    } catch {
      // Terminating a dead worker is not an error worth surfacing.
    }
  }
  worker = null
  workerBroken = false
}

// Stop using the worker for the rest of the session: terminate
// whatever is running and remember not to spawn another one. Used
// when the worker itself fails (an error response or an onerror),
// not for a single bad input — the main-thread fallback gives the
// identical result, so a broken worker costs nothing to drop and
// everything to keep retrying.
const breakWorker = (): void => {
  workerBroken = true
  if (worker) {
    try {
      worker.terminate()
    } catch {
      // Terminating a dead worker is not an error worth surfacing.
    }
    worker = null
  }
}

const createWorker = (): Worker | null => {
  const override = workerFactoryOverride
  // An injected factory decides: a fake worker for tests, or null
  // to force the main-thread fallback. undefined means "decide
  // here": use the browser Worker when there is one.
  if (override !== undefined) return override === null ? null : override()
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('./analysisWorker.ts', import.meta.url), {
      type: 'module',
    })
  } catch {
    return null
  }
}

const getWorker = (): Worker | null => {
  if (workerBroken) return null
  if (!worker) {
    worker = createWorker()
    if (!worker) {
      workerBroken = true
      return null
    }
    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      const response = event.data
      const item = pending.get(response.id)
      if (!item) return
      pending.delete(response.id)
      clearTimeout(item.timer)
      item.resolve(response)
    }
    worker.onerror = () => {
      // The worker died: fail every pending request over to the
      // main-thread fallback, and stop trying the worker.
      for (const [, item] of pending) {
        clearTimeout(item.timer)
        item.reject(new Error('The analysis worker failed.'))
      }
      pending.clear()
      breakWorker()
    }
  }
  return worker
}

const runInWorker = (request: AnalysisRequest): Promise<AnalysisResponse> =>
  new Promise((resolve, reject) => {
    const target = getWorker()
    if (!target) {
      reject(new Error('No analysis worker is available.'))
      return
    }
    const timer = setTimeout(() => {
      pending.delete(request.id)
      // The worker is wedged on this request: terminate it instead
      // of leaving it alive to hold the next scan hostage. The next
      // request spawns a fresh worker — the worker is not marked
      // broken, because a timeout can be input-specific (a huge
      // paste) rather than a broken worker.
      try {
        target.terminate()
      } catch {
        // Terminating a dead worker is not an error worth surfacing.
      }
      if (worker === target) worker = null
      reject(new Error('The analysis worker timed out.'))
    }, WORKER_TIMEOUT_MS)
    pending.set(request.id, { resolve, reject, timer })
    try {
      target.postMessage(request)
    } catch (caught) {
      pending.delete(request.id)
      clearTimeout(timer)
      reject(
        caught instanceof Error ? caught : new Error('The worker could not start.'),
      )
    }
  })

const runOrFallback = async <T,>(
  request: AnalysisRequest,
  fallback: () => T | Promise<T>,
): Promise<T> => {
  try {
    const response = await runInWorker(request)
    if (!response.ok) {
      // The worker answered with a failure: it is not going to
      // answer the next request either, so stop sending it work.
      // The fallback below returns the identical result.
      breakWorker()
      throw new Error(response.error)
    }
    return response.result as T
  } catch {
    // Any worker failure — unavailable, dead, timed out, or an
    // analysis error inside the worker — falls back to the same
    // analyser on the main thread. The result is identical; only
    // the thread changes.
    return fallback()
  }
}

export const analyzeCopyAsync = (text: string): Promise<Analysis> =>
  runOrFallback({ id: nextId++, kind: 'copy', text }, () => analyze(text))

// Website analysis runs on the main thread, not in the worker:
// analyzeSite() needs DOMParser, which a worker does not have
// (F2). This is the same analyser the fallback always ran —
// identical result, without the failed worker round-trip.
export const analyzeSiteAsync = async (
  source: SiteSource,
): Promise<SiteAnalysis> => analyzeSite(source)

// For tests: the handler, so a fake worker can answer exactly like
// the real one.
export const answerLikeWorker = handleAnalysisRequest
