import * as vscode from "vscode"
import { inspect } from "util"

let channel: vscode.OutputChannel | undefined

/**
 * Get the shared "Kilo Extension" output channel, creating it lazily on first use.
 * All extension logging (outside Agent Manager and Diff Viewer) goes here.
 */
export function getOutputChannel(): vscode.OutputChannel {
  return (channel ??= vscode.window.createOutputChannel("Kilo Extension"))
}

/**
 * Write a formatted log line to the "Kilo Extension" output channel.
 * Accepts the same variadic signature as console.log.
 */
export function log(...args: unknown[]): void {
  const msg = args
    .map((item) => (typeof item === "string" ? item : inspect(item, { breakLength: Infinity, depth: 4 })))
    .join(" ")
  getOutputChannel().appendLine(`${new Date().toISOString()} ${msg}`)
}
