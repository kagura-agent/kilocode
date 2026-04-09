import * as vscode from "vscode"

export const WEBVIEW_READY_TIMEOUT = 8_000
export const WEBVIEW_READY_RETRIES = 3

type Scheduler = {
  set(callback: () => void, timeout: number): unknown
  clear(timer: unknown): void
}

export type WebviewReadyRetryEvent = "retry" | "failed"

export type WebviewReadyRetryOptions = {
  name: string
  active?: () => boolean
  html: () => string | undefined
  load: (html: string) => void
  log?: (message: string) => void
  warn?: (message: string) => void
  notify?: () => void
  capture?: (event: WebviewReadyRetryEvent, props: Record<string, unknown>) => void
  scheduler?: Scheduler
  timeout?: number
  retries?: number
}

const scheduler: Scheduler = {
  set: (callback, timeout) => setTimeout(callback, timeout),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}

export class WebviewReadyRetry {
  private timer: unknown = null
  private attempts = 0
  private ready = false
  private html: () => string | undefined

  constructor(private readonly opts: WebviewReadyRetryOptions) {
    this.html = opts.html
  }

  start(html?: () => string | undefined): void {
    this.stop()
    this.ready = false
    this.attempts = 0
    this.html = html ?? this.opts.html
    this.arm()
  }

  done(): void {
    this.ready = true
    this.stop()
  }

  dispose(): void {
    this.stop()
  }

  private get active(): boolean {
    return this.opts.active?.() ?? true
  }

  private get delay(): number {
    return (this.opts.timeout ?? WEBVIEW_READY_TIMEOUT) * (this.attempts + 1)
  }

  private get retries(): number {
    return this.opts.retries ?? WEBVIEW_READY_RETRIES
  }

  private get scheduler(): Scheduler {
    return this.opts.scheduler ?? scheduler
  }

  private arm(): void {
    this.timer = this.scheduler.set(() => this.retry(), this.delay)
  }

  private retry(): void {
    const delay = this.delay
    this.timer = null

    if (this.ready || !this.active) return

    if (this.attempts >= this.retries) {
      this.log(
        `webview not ready after ${this.retries} retries - likely VS Code service worker bug ` +
          `(microsoft/vscode#125993). Try "Developer: Reload Window".`,
      )
      this.opts.capture?.("failed", { name: this.opts.name, retries: this.retries })
      this.opts.notify?.()
      return
    }

    this.attempts++
    this.warn(`webview not ready after ${delay}ms, retrying (${this.attempts}/${this.retries})`)
    this.opts.capture?.("retry", {
      name: this.opts.name,
      attempt: this.attempts,
      retries: this.retries,
      timeout: delay,
    })

    const html = this.html()
    if (this.ready || !this.active || html === undefined) return

    this.opts.load(html)
    if (this.ready || !this.active) return

    this.arm()
  }

  private stop(): void {
    const timer = this.timer
    if (timer === null) return

    this.scheduler.clear(timer)
    this.timer = null
  }

  private log(message: string): void {
    this.opts.log?.(`[Kilo New] ${this.opts.name}: ${message}`)
  }

  private warn(message: string): void {
    this.opts.warn?.(`[Kilo New] ${this.opts.name}: ${message}`)
  }
}

export function showWebviewReloadWarning(): void {
  void vscode.window
    .showWarningMessage(
      "Kilo Code failed to load. This is a known VS Code issue. Try reloading the window.",
      "Reload Window",
    )
    .then((choice) => {
      if (choice !== "Reload Window") return
      void vscode.commands.executeCommand("workbench.action.reloadWindow")
    })
}
