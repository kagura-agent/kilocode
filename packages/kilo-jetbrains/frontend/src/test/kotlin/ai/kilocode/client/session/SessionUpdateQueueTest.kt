package ai.kilocode.client.session

import ai.kilocode.client.session.model.SessionModelEvent
import ai.kilocode.client.session.model.SessionState
import ai.kilocode.rpc.dto.ChatEventDto

class SessionUpdateQueueTest : SessionControllerTestBase() {

    fun `test hidden controller buffers until shown`() {
        appRpc.state.value = ai.kilocode.rpc.dto.KiloAppStateDto(ai.kilocode.rpc.dto.KiloAppStatusDto.READY)
        projectRpc.state.value = workspaceReady()
        val m = controller("ses_test", flushMs = 250L)
        val modelEvents = collectModelEvents(m)
        flush()
        modelEvents.clear()

        hide(m)
        emit(ChatEventDto.TurnOpen("ses_test"), flush = false)
        emit(ChatEventDto.MessageUpdated("ses_test", msg("msg1", "ses_test", "assistant")), flush = false)
        settle()

        assertTrue(modelEvents.isEmpty())
        assertEquals(SessionState.Idle, m.model.state)

        show(m)
        settle()
        flush()

        assertModelEvents("""
            StateChanged Busy
            MessageAdded msg1
            TurnAdded msg1 [msg1]
        """, modelEvents)
        assertTrue(m.model.state is SessionState.Busy)
    }

    fun `test buffered deltas coalesce into one model delta`() {
        appRpc.state.value = ai.kilocode.rpc.dto.KiloAppStateDto(ai.kilocode.rpc.dto.KiloAppStatusDto.READY)
        projectRpc.state.value = workspaceReady()
        val m = controller("ses_test", flushMs = Long.MAX_VALUE)
        val modelEvents = collectModelEvents(m)
        flush()
        modelEvents.clear()

        emit(ChatEventDto.MessageUpdated("ses_test", msg("msg1", "ses_test", "assistant")))
        modelEvents.clear()

        emit(ChatEventDto.PartDelta("ses_test", "msg1", "prt1", "text", "hello "), flush = false)
        emit(ChatEventDto.PartDelta("ses_test", "msg1", "prt1", "text", "world"), flush = false)
        settle()
        flush()

        assertEquals(1, modelEvents.count { it is SessionModelEvent.ContentAdded })
        val delta = modelEvents.filterIsInstance<SessionModelEvent.ContentDelta>()
        assertEquals(1, delta.size)
        assertModel(
            """
            assistant#msg1
            text#prt1:
              hello world
            """,
            m,
        )
        assertEquals(listOf("hello world"), delta.map { it.delta })
    }

    fun `test visible controller flushes after cadence`() {
        appRpc.state.value = ai.kilocode.rpc.dto.KiloAppStateDto(ai.kilocode.rpc.dto.KiloAppStatusDto.READY)
        projectRpc.state.value = workspaceReady()
        val m = controller("ses_test", flushMs = 50L)
        val modelEvents = collectModelEvents(m)
        flush()
        modelEvents.clear()

        emit(ChatEventDto.TurnOpen("ses_test"), flush = false)
        flush()

        assertTrue(modelEvents.any { it is SessionModelEvent.StateChanged })
        assertTrue(m.model.state is SessionState.Busy)
    }
}
