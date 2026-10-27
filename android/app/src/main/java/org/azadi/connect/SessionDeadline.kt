package org.azadi.connect
object SessionDeadline {
    fun fromMinutes(minutes: Int, now: Long): Long {
        require(minutes in 0..1440 && now >= 0)
        if (minutes == 0) return 0
        val duration = minutes * 60000L
        require(now <= Long.MAX_VALUE - duration)
        return now + duration
    }
    fun expired(deadline: Long, now: Long) = deadline > 0 && now >= deadline
}
