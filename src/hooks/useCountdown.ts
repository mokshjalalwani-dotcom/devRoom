import { useState, useEffect } from 'react'

export function useCountdown(expiresAt: string) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const end = new Date(expiresAt).getTime()
      const now = Date.now()
      const diff = end - now

      if (diff <= 0) {
        setTimeLeft('Expired')
        return
      }

      const totalMinutes = Math.floor(diff / 1000 / 60)
      const days = Math.floor(totalMinutes / (24 * 60))
      const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
      const minutes = totalMinutes % 60

      let parts = []
      if (days > 0) parts.push(`${days}d`)
      if (hours > 0 || days > 0) parts.push(`${hours}h`)
      parts.push(`${minutes}m`)

      setTimeLeft(parts.join(' '))
    }
    
    update()
    // Update every minute, or every second if < 1 minute?
    // Every minute is fine as per spec. We update at the next minute boundary for accuracy, but interval 10s is safer.
    const interval = setInterval(update, 10000) 
    return () => clearInterval(interval)
  }, [expiresAt])

  return timeLeft
}
