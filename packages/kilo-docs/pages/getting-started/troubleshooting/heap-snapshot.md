---
title: "Heap Snapshot"
description: "How to capture a heap snapshot for diagnosing memory issues in Kilo Code"
platform: new
---

# Heap Snapshot

If Kilo Code is consuming excessive memory or becoming unresponsive, capturing a heap snapshot helps the team diagnose the issue. A heap snapshot records every object in memory at a single point in time and can be loaded in Chrome DevTools for analysis.

## Taking a Heap Snapshot in VS Code

1. **Open the Command Palette**: Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
2. **Run the command**: Type `Kilo Code: Take Heap Snapshot` and select it
3. **Wait for confirmation**: A notification will appear with the file path where the snapshot was saved

The snapshot is written to the Kilo log directory as a `.heapsnapshot` file. The filename includes the process ID and timestamp, for example:

```
heap-12345-20260416T125800000Z.heapsnapshot
```

{% callout type="info" %}
The command captures a snapshot of the **CLI backend process** (`kilo serve`), not the VS Code extension host. This is where the AI agent runtime, session management, and tool execution happen — and where memory issues most commonly occur.
{% /callout %}

## Analyzing a Heap Snapshot

You can open the `.heapsnapshot` file in Chrome DevTools:

1. Open Chrome and navigate to `chrome://inspect`
2. Click **Open dedicated DevTools for Node**
3. Go to the **Memory** tab
4. Click **Load** and select the `.heapsnapshot` file

From there you can inspect object allocations, retained sizes, and reference chains to identify memory leaks.

## Reporting a Memory Issue

When reporting a memory issue, include the following with your report:

1. The `.heapsnapshot` file (or a summary of what you found)
2. Steps to reproduce the high memory usage
3. Your Kilo Code and VS Code versions
4. The approximate time the issue started and what you were doing

Send reports to **[hi@kilocode.ai](mailto:hi@kilocode.ai)** or file an issue on [GitHub](https://github.com/Kilo-Org/kilocode).
