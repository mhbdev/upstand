"use client";

import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { getServerApiUrl } from "@/lib/server-url";

interface TerminalEmulatorProps {
  token: string;
  onReady?: () => void;
  onClose?: (reason?: string) => void;
}

type TerminalControlMessage =
  | { type: "terminal.ready" }
  | { type: "terminal.error"; message: string };

function getTerminalSocketUrl(token: string): string {
  const url = new URL(getServerApiUrl("/api/terminal/connect"));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

function parseControlMessage(data: string): TerminalControlMessage | null {
  try {
    const message = JSON.parse(data) as Partial<TerminalControlMessage>;
    if (message.type === "terminal.ready") return { type: message.type };
    if (
      message.type === "terminal.error" &&
      typeof message.message === "string"
    ) {
      return { type: message.type, message: message.message };
    }
  } catch {
    // Regular terminal output is sent as binary, but preserve unexpected text.
  }
  return null;
}

export function TerminalEmulator({
  token,
  onReady,
  onClose,
}: TerminalEmulatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onReadyRef.current = onReady;
    onCloseRef.current = onClose;
  }, [onClose, onReady]);

  useEffect(() => {
    let isMounted = true;
    let closingIntentionally = false;
    let connectionError: string | undefined;
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

      ws = new WebSocket(getTerminalSocketUrl(token));
      ws.binaryType = "arraybuffer";

      ws.onmessage = async (event) => {
        if (typeof event.data === "string") {
          const controlMessage = parseControlMessage(event.data);
          if (controlMessage?.type === "terminal.ready") {
            term.focus();
            onReadyRef.current?.();
            return;
          }
          if (controlMessage?.type === "terminal.error") {
            connectionError = controlMessage.message;
            term.write(`\r\n\x1b[1;31m[${controlMessage.message}]\x1b[0m\r\n`);
            return;
          }
        }

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
        if (closingIntentionally || !isMounted) return;
        const reason = connectionError || e.reason || "SSH session closed";
        term.write(`\r\n\x1b[1;31m[Disconnected: ${reason}]\x1b[0m\r\n`);
        onCloseRef.current?.(reason);
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

    initTerminal().catch((error) => {
      if (!isMounted) return;
      onCloseRef.current?.(
        error instanceof Error ? error.message : "Unable to start terminal",
      );
    });

    return () => {
      isMounted = false;
      closingIntentionally = true;
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
