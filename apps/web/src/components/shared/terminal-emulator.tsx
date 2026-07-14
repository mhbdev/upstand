"use client";

import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

interface TerminalEmulatorProps {
  token: string;
  onClose?: () => void;
}

export function TerminalEmulator({ token, onClose }: TerminalEmulatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    let termInstance: any = null;
    let resizeObserver: ResizeObserver | null = null;

    async function initTerminal() {
      // Lazily import xterm and fit addon to avoid SSR errors in Next.js
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      if (!isMounted || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        lineHeight: 1.2,
        fontFamily:
          "Geist Mono, var(--font-geist-mono), ui-monospace, monospace",
        theme: {
          background: "#080c0a",
          foreground: "#f1f5f9",
          cursor: "#22c55e", // green cursor
          cursorAccent: "#080c0a",
          selectionBackground: "rgba(34, 197, 94, 0.3)",
          black: "#020617",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#ec4899",
          cyan: "#06b6d4",
          white: "#cbd5e1",
          brightBlack: "#64748b",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#facc15",
          brightBlue: "#60a5fa",
          brightMagenta: "#f472b6",
          brightCyan: "#22d3ee",
          brightWhite: "#f8fafc",
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(containerRef.current);
      fitAddon.fit();

      termInstance = term;

      // Connect to WebSocket session
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.host;

      const apiBase = process.env.NEXT_PUBLIC_SERVER_URL || "";
      let wsUrlString = "";
      if (apiBase) {
        const apiBaseUrl = new URL(apiBase);
        const wsProtocol = apiBaseUrl.protocol === "https:" ? "wss:" : "ws:";
        wsUrlString = `${wsProtocol}//${apiBaseUrl.host}/api/terminal/connect?token=${encodeURIComponent(token)}`;
      } else {
        wsUrlString = `${protocol}//${wsHost}/api/terminal/connect?token=${encodeURIComponent(token)}`;
      }

      ws = new WebSocket(wsUrlString);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        term.write("\x1b[1;32mConnected to interactive session.\x1b[0m\r\n");
      };

      ws.onmessage = async (event) => {
        const text =
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(
                event.data instanceof Blob
                  ? await event.data.arrayBuffer()
                  : event.data,
              );
        term.write(text);
      };

      ws.onerror = () => {
        term.write("\r\n\x1b[1;31m[Terminal Connection Error]\x1b[0m\r\n");
      };

      ws.onclose = (e) => {
        term.write(
          `\r\n\x1b[1;31m[Disconnected: ${e.reason || "SSH session closed"}]\x1b[0m\r\n`,
        );
        onCloseRef.current?.();
      };

      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Handle Container resize dynamically via ResizeObserver
      resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
        } catch (_e) {
          // ignore fit issues during transitions
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    initTerminal();

    return () => {
      isMounted = false;
      if (ws) {
        ws.close();
      }
      if (termInstance) {
        termInstance.dispose();
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [token]);

  return (
    <div className="relative h-full w-full select-text bg-[#080c0a] p-2">
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
    </div>
  );
}
