package ai.kilocode.client.session

import ai.kilocode.rpc.dto.ChatEventDto
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.Disposer
import java.awt.Component
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

internal const val EVENT_FLUSH_MS = 250L

internal class SessionUpdateQueue(
    parent: Disposable,
    private val comp: Component?,
    private val flushMs: Long = EVENT_FLUSH_MS,
    private val fire: (List<ChatEventDto>) -> Unit,
    hold: Boolean,
) : Disposable {
    private val app = ApplicationManager.getApplication()
    private val pending = mutableListOf<ChatEventDto>()
    private val exec: ScheduledExecutorService? = if (flushMs == Long.MAX_VALUE) null else Executors.newSingleThreadScheduledExecutor()
    private var last = 0L
    private var hold = hold

    init {
        Disposer.register(parent, this)
        exec?.scheduleAtFixedRate(
            { requestFlush(false) },
            flushMs,
            flushMs,
            TimeUnit.MILLISECONDS,
        )
    }

    fun enqueue(event: ChatEventDto) {
        edt {
            pending.add(event)
            flushNow(false)
        }
    }

    fun holdFlush(hold: Boolean) {
        edt { this.hold = hold }
    }

    fun requestFlush(forced: Boolean) {
        edt { flushNow(forced) }
    }

    override fun dispose() {
        exec?.shutdownNow()
        if (app.isDispatchThread) {
            pending.clear()
            return
        }
        app.invokeLater { pending.clear() }
    }

    private fun flushNow(forced: Boolean) {
        if (hold) return
        if (!showing()) return
        if (pending.isEmpty()) return
        val now = System.currentTimeMillis()
        if (!forced && now - last < flushMs) return
        val batch = condense(pending.toList())
        pending.clear()
        last = now
        fire(batch)
    }

    private fun showing(): Boolean = comp?.isShowing ?: true

    private fun edt(block: () -> Unit) {
        if (app.isDispatchThread) {
            block()
            return
        }
        app.invokeLater(block)
    }
}

private fun condense(events: List<ChatEventDto>): List<ChatEventDto> {
    if (events.size < 2) return events
    val out = mutableListOf<ChatEventDto>()
    val deltas = LinkedHashMap<String, ChatEventDto.PartDelta>()

    fun drain() {
        if (deltas.isEmpty()) return
        out.addAll(deltas.values)
        deltas.clear()
    }

    for (event in events) {
        val delta = event as? ChatEventDto.PartDelta
        val key = delta?.key()
        if (key == null) {
            drain()
            out.add(event)
            continue
        }
        val prev = deltas[key]
        deltas[key] = if (prev != null) prev.merge(delta) else delta
    }

    drain()
    return out
}

private fun ChatEventDto.PartDelta.key(): String? {
    if (field != "text") return null
    return "$sessionID:$messageID:$partID:$field"
}

private fun ChatEventDto.PartDelta.merge(next: ChatEventDto.PartDelta): ChatEventDto.PartDelta =
    ChatEventDto.PartDelta(next.sessionID, next.messageID, next.partID, next.field, delta + next.delta)
