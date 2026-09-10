import { useEffect, useRef, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/stores/authStore"
import { useQueryClient } from "@tanstack/react-query"
import type { WebSocketMessage } from "@/types"

type ConnectionState = "connecting" | "connected" | "disconnected" | "error"

export function useOrderWebSocket() {
  const { token } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected")

  // Play notification sound
  const playNotificationSound = () => {
    try {
      const audio = new Audio("/sounds/notification.mp3")
      audio.volume = 0.5
      audio.play().catch(() => {
        // Browser may block autoplay - that's ok
        console.debug("Audio autoplay blocked")
      })
    } catch {
      // Audio file not found - ignore
    }
  }

  // Connect to WebSocket - connect directly to backend to avoid proxy EPIPE errors
  const connect = () => {
    if (!token) return

    setConnectionState("connecting")

    // Resolve the WebSocket base URL:
    //  1. VITE_WS_URL if set (explicit override, e.g. ws://localhost:5070 for local dev)
    //  2. otherwise derive from the current page origin, so a deployed site on
    //     https://admin.asiantaste.com.au connects to wss://admin.asiantaste.com.au/ws/orders
    // This avoids hardcoding localhost, which breaks in any non-local environment.
    const envWsUrl = import.meta.env.VITE_WS_URL as string | undefined
    const wsBase =
      envWsUrl && envWsUrl.length > 0
        ? envWsUrl.replace(/\/$/, "")
        : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`

    const wsUrl = `${wsBase}/ws/orders?token=${token}`

    console.log("[WebSocket] Attempting to connect to:", wsUrl.replace(/token=[^&]+/, "token=REDACTED"))

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      console.log("[WebSocket] WebSocket object created, waiting for connection...")

      ws.onopen = () => {
        setConnectionState("connected")
        console.log("WebSocket connected")
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)

          switch (message.type) {
            case "connected":
              console.log("WebSocket connection confirmed:", message.connectionId)
              break

            case "new_order":
              // Show toast notification
              toast({
                title: "🔔 New Order Received!",
                description: `Order ${message.data?.toString()} has been placed.`,
                variant: "info",
              })
              // Play sound
              playNotificationSound()
              // Refresh dashboard data
              queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
              queryClient.invalidateQueries({ queryKey: ["orders"] })
              break

            case "status_update":
              // Refresh orders when status changes
              queryClient.invalidateQueries({ queryKey: ["orders"] })
              queryClient.invalidateQueries({ queryKey: ["order-detail", message.orderId] })
              break

            case "dashboard_update":
              // Refresh dashboard data
              queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
              break
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error)
        }
      }

      ws.onclose = () => {
        setConnectionState("disconnected")
        console.log("WebSocket disconnected")
        // Attempt to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, 5000)
      }

      ws.onerror = (error) => {
        setConnectionState("error")
        console.error("[WebSocket] Error event:", error)
        console.error("[WebSocket] WebSocket state:", ws.readyState)
      }
    } catch (error) {
      setConnectionState("error")
      console.error("Failed to create WebSocket connection:", error)
    }
  }

  // Disconnect WebSocket
  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionState("disconnected")
  }

  // Connect/disconnect based on token availability
  useEffect(() => {
    if (token) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return {
    connectionState,
    isConnected: connectionState === "connected",
  }
}
