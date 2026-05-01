import { useEffect, useRef, useState } from 'react'

export function useWebSocket(onMessage) {
  const ws = useRef(null)
  const onMessageRef = useRef(onMessage)
  const [connected, setConnected] = useState(false)

  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])

  useEffect(() => {
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      const wsUrl = window.location.protocol === 'file:' ? 'ws://localhost:8000/ws' : 'ws://localhost:3000/ws'
      const socket = new WebSocket(wsUrl)
      ws.current = socket

      socket.onopen    = () => { if (!cancelled) setConnected(true) }
      socket.onmessage = (e) => {
        if (cancelled) return
        try {
          onMessageRef.current(JSON.parse(e.data))
        } catch (err) {
          console.error('[WS] parse error:', err, e.data?.slice?.(0, 200))
        }
      }
      socket.onclose   = () => {
        if (!cancelled) {
          setConnected(false)
          setTimeout(connect, 2000)
        }
      }
      socket.onerror   = () => socket.close()
    }

    connect()
    return () => {
      cancelled = true
      ws.current?.close()
    }
  }, [])

  return connected
}
