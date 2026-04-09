import { describe, expect, it } from "bun:test"
import { WEBVIEW_READY_RETRIES, WEBVIEW_READY_TIMEOUT, WebviewReadyRetry } from "../../src/webview-ready-retry"

class Scheduler {
  delays: number[] = []
  cleared: unknown[] = []
  private seq = 0
  private tasks = new Map<number, () => void>()

  set(callback: () => void, timeout: number): number {
    const id = this.seq + 1
    this.seq = id
    this.delays.push(timeout)
    this.tasks.set(id, callback)
    return id
  }

  clear(timer: unknown): void {
    this.cleared.push(timer)
    if (typeof timer !== "number") return
    this.tasks.delete(timer)
  }

  run(): void {
    const id = this.tasks.keys().next().value
    if (id === undefined) return

    const task = this.tasks.get(id)
    this.tasks.delete(id)
    task?.()
  }

  get pending(): number {
    return this.tasks.size
  }
}

describe("WebviewReadyRetry", () => {
  it("cancels the timer when the webview is ready", () => {
    const scheduler = new Scheduler()
    const loads: string[] = []
    const retry = new WebviewReadyRetry({
      name: "Test",
      html: () => "html",
      load: (html) => loads.push(html),
      scheduler,
    })

    retry.start()
    retry.done()
    scheduler.run()

    expect(loads).toEqual([])
    expect(scheduler.pending).toBe(0)
    expect(scheduler.cleared).toEqual([1])
  })

  it("retries with backoff and stops after the cap", () => {
    const scheduler = new Scheduler()
    const loads: string[] = []
    const notices: string[] = []
    const events: string[] = []
    const retry = new WebviewReadyRetry({
      name: "Test",
      html: () => "html",
      load: (html) => loads.push(html),
      notify: () => notices.push("reload"),
      capture: (event) => events.push(event),
      scheduler,
    })

    retry.start()
    for (const _ of Array.from({ length: WEBVIEW_READY_RETRIES })) scheduler.run()
    scheduler.run()

    expect(loads).toEqual(["html", "html", "html"])
    expect(notices).toEqual(["reload"])
    expect(events).toEqual(["retry", "retry", "retry", "failed"])
    expect(scheduler.pending).toBe(0)
    expect(scheduler.delays).toEqual([
      WEBVIEW_READY_TIMEOUT,
      WEBVIEW_READY_TIMEOUT * 2,
      WEBVIEW_READY_TIMEOUT * 3,
      WEBVIEW_READY_TIMEOUT * 4,
    ])
  })

  it("cancels the timer on dispose", () => {
    const scheduler = new Scheduler()
    const retry = new WebviewReadyRetry({
      name: "Test",
      html: () => "html",
      load: () => undefined,
      scheduler,
    })

    retry.start()
    retry.dispose()

    expect(scheduler.pending).toBe(0)
    expect(scheduler.cleared).toEqual([1])
  })

  it("does not reload if ready flips during html generation", () => {
    const scheduler = new Scheduler()
    const loads: string[] = []
    const box: { retry?: WebviewReadyRetry } = {}
    const retry = new WebviewReadyRetry({
      name: "Test",
      html: () => {
        box.retry?.done()
        return "html"
      },
      load: (html) => loads.push(html),
      scheduler,
    })
    box.retry = retry

    retry.start()
    scheduler.run()

    expect(loads).toEqual([])
    expect(scheduler.pending).toBe(0)
  })
})
