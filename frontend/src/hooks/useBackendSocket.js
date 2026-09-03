import { useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:8765';

export function useBackendSocket(onEvent) {
  const socketRef = useRef(null);
  const reconnectRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let mounted = true;

    const connect = () => {
      if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!mounted) return;
        setConnected(true);
        ws.send(JSON.stringify({ type: 'request_state' }));
      };

      ws.onmessage = (event) => {
        if (!mounted) return;
        try {
          const payload = JSON.parse(event.data);
          onEvent?.(payload);
        } catch (_error) {
          // Ignore malformed payloads.
        }
      };

      ws.onclose = () => {
        if (!mounted) return;
        setConnected(false);
        reconnectRef.current = window.setTimeout(connect, 500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
      }
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
    };
  }, [onEvent]);

  const send = (message) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  };

  return { connected, send };
}
