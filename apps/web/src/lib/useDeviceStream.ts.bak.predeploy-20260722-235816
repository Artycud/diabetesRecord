"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type AcetoneLabel =
  | "clean"
  | "basal"
  | "light_ketosis"
  | "nutritional_ketosis"
  | "deep_ketosis"
  | "dka_risk"
  | "unreliable";

export interface LiveReading {
  device_id: string;
  time: string;
  /** Acetone signal delta in **millivolts** (voltage delta from baseline × 1000) */
  acetone_delta_mv: number;
  sensor_voltage: number | null;
  baseline_voltage: number | null;
  pressure_kpa: number | null;
  temperature: number | null;
  humidity: number | null;
  label: AcetoneLabel;
  quality_score: number;
  confidence_score: number;
}

interface StreamState {
  reading: LiveReading | null;
  connected: boolean;
  error: string | null;
}

function getWsBase(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit && /^wss?:\/\//i.test(explicit)) {
    return explicit.replace(/\/$/, "").replace(/\/ws$/, "");
  }
  const api = process.env.NEXT_PUBLIC_API_URL ?? "";
  if (api && /^https?:\/\//i.test(api)) {
    return api.replace(/^http/i, "ws").replace(/\/$/, "").replace(/\/api$/, "");
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}`;
  }
  return "ws://localhost:8000";
}

export function useDeviceStream(userId: string | undefined): StreamState {
  const [state, setState] = useState<StreamState>({
    reading: null,
    connected: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(2000);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (!userId || unmounted.current) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;

    const url = `${getWsBase()}/ws/readings/${userId}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      retryDelay.current = 2000;
      setState((s) => ({ ...s, connected: true, error: null }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as LiveReading;
        setState((s) => ({ ...s, reading: data }));
      } catch {
        // non-JSON frames (e.g. "pong") are ignored
      }
    };

    ws.onerror = () => {
      setState((s) => ({ ...s, connected: false, error: "Connection error" }));
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setState((s) => ({ ...s, connected: false }));
      // Exponential backoff reconnect (max 30s)
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 1.5, 30000);
        connect();
      }, retryDelay.current);
    };
  }, [userId]);

  useEffect(() => {
    unmounted.current = false;
    connect();

    // Keepalive ping every 25s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 25000);

    return () => {
      unmounted.current = true;
      clearInterval(pingInterval);
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return state;
}
