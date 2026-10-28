package org.azadi.connect
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

/** Owns state publication and timer delivery across service/process restarts. */
class SessionGuard(private val owner: AtomicReference<String>, val id: String = UUID.randomUUID().toString()) {
    init { owner.set(id) }
    val isCurrent: Boolean get() = owner.get() == id
    fun acceptsTimer(token: String?, sessionToken: String = id): Boolean = isCurrent && (token == null || token == sessionToken)
}
