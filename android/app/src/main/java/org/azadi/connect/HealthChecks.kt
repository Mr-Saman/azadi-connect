package org.azadi.connect
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

object HealthChecks {
    val targets = listOf("https://1.1.1.1/cdn-cgi/trace", "https://www.gstatic.com/generate_204")
    suspend fun latency(probe: (String) -> Long): Long? {
        for (target in targets) {
            currentCoroutineContext().ensureActive()
            try { return probe(target) } catch (e: CancellationException) { throw e } catch (_: Exception) {}
        }
        return null
    }
}
