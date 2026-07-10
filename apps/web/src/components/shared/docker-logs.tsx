import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import { Input } from "@upstand/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@upstand/ui/components/popover";
import { Separator } from "@upstand/ui/components/separator";
import { Switch } from "@upstand/ui/components/switch";
import { cn } from "@upstand/ui/lib/utils";
import {
  Check,
  Clock,
  Copy,
  Download,
  Filter,
  Hash,
  Pause,
  Play,
} from "lucide-react";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Log parser and style rules
export type LogType = "error" | "warning" | "success" | "info" | "debug";
export type LogVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

export interface LogLine {
  rawTimestamp: string | null;
  timestamp: Date | null;
  message: string;
}

interface LogStyle {
  type: LogType;
  variant: LogVariant;
}

const LOG_STYLES: Record<LogType, LogStyle> = {
  error: {
    type: "error",
    variant: "destructive",
  },
  warning: {
    type: "warning",
    variant: "secondary",
  },
  debug: {
    type: "debug",
    variant: "outline",
  },
  success: {
    type: "success",
    variant: "default",
  },
  info: {
    type: "info",
    variant: "secondary",
  },
} as const;

export const priorities = [
  { label: "Info", value: "info" },
  { label: "Success", value: "success" },
  { label: "Warning", value: "warning" },
  { label: "Debug", value: "debug" },
  { label: "Error", value: "error" },
];

export const getLogType = (message: string): LogStyle => {
  const statusMatch = message.match(/"statusCode"\s*:\s*"?(\d{3})"?/);
  if (statusMatch) {
    const statusCode = Number(statusMatch[1]);
    if (statusCode >= 500) return LOG_STYLES.error;
    if (statusCode >= 400) return LOG_STYLES.warning;
    if (statusCode >= 200 && statusCode < 300) return LOG_STYLES.success;
    return LOG_STYLES.info;
  }

  const lowerMessage = message.toLowerCase();

  if (
    /(?:^|\s)(?:info|inf|information):?\s/i.test(lowerMessage) ||
    /\[(?:info|information)\]/i.test(lowerMessage) ||
    /\b(?:status|state|current|progress)\b:?\s/i.test(lowerMessage) ||
    /\b(?:processing|executing|performing)\b/i.test(lowerMessage)
  ) {
    return LOG_STYLES.info;
  }

  if (
    /(?:^|\s)(?:error|err):?\s/i.test(lowerMessage) ||
    /\b(?:exception|failed|failure)\b/i.test(lowerMessage) ||
    /(?:stack\s?trace):\s*$/i.test(lowerMessage) ||
    /^\s*at\s+[\w.]+\s*\(?.+:\d+:\d+\)?/.test(lowerMessage) ||
    /\b(?:uncaught|unhandled)\s+(?:exception|error)\b/i.test(lowerMessage) ||
    /Error:\s.*(?:in|at)\s+.*:\d+(?::\d+)?/.test(lowerMessage) ||
    /\b(?:errno|code):\s*(?:\d+|[A-Z_]+)\b/i.test(lowerMessage) ||
    /\[(?:error|err|fatal)\]/i.test(lowerMessage) ||
    /\b(?:crash|critical|fatal)\b/i.test(lowerMessage) ||
    /\b(?:fail(?:ed|ure)?|broken|dead)\b/i.test(lowerMessage)
  ) {
    return LOG_STYLES.error;
  }

  if (
    /(?:^|\s)(?:warning|warn):?\s/i.test(lowerMessage) ||
    /\[(?:warn(?:ing)?|attention)\]/i.test(lowerMessage) ||
    /(?:deprecated|obsolete)\s+(?:since|in|as\s+of)/i.test(lowerMessage) ||
    /\b(?:caution|attention|notice):\s/i.test(lowerMessage) ||
    /(?:might|may|could)\s+(?:not|cause|lead\s+to)/i.test(lowerMessage) ||
    /(?:!+\s*(?:warning|caution|attention)\s*!+)/i.test(lowerMessage) ||
    /\b(?:deprecated|obsolete)\b/i.test(lowerMessage) ||
    /\b(?:unstable|experimental)\b/i.test(lowerMessage) ||
    /⚠|⚠️/i.test(lowerMessage)
  ) {
    return LOG_STYLES.warning;
  }

  if (
    /(?:successfully|complete[d]?)\s+(?:initialized|started|completed|created|done|deployed)/i.test(
      lowerMessage,
    ) ||
    /\[(?:success|ok|done)\]/i.test(lowerMessage) ||
    /(?:listening|running)\s+(?:on|at)\s+(?:port\s+)?\d+/i.test(lowerMessage) ||
    /(?:connected|established|ready)\s+(?:to|for|on)/i.test(lowerMessage) ||
    /\b(?:loaded|mounted|initialized)\s+successfully\b/i.test(lowerMessage) ||
    /✓|√|✅|\[ok\]|done!/i.test(lowerMessage) ||
    /\b(?:success(?:ful)?|completed|ready)\b/i.test(lowerMessage) ||
    /\b(?:started|starting|active)\b/i.test(lowerMessage)
  ) {
    return LOG_STYLES.success;
  }

  if (
    /(?:^|\s)(?:info|inf):?\s/i.test(lowerMessage) ||
    /\[(info|log|debug|trace|server|db|api|http|request|response)\]/i.test(
      lowerMessage,
    ) ||
    /\b(?:version|config|import|load|get|HTTP|PATCH|POST|debug)\b:?/i.test(
      lowerMessage,
    )
  ) {
    return LOG_STYLES.debug;
  }

  return LOG_STYLES.info;
};

const parseLogLine = (line: string): LogLine => {
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+(.*)$/);
  if (!match) {
    return { rawTimestamp: null, timestamp: null, message: line };
  }

  const timestamp = new Date(match[1]);
  return {
    rawTimestamp: match[1],
    timestamp: Number.isNaN(timestamp.getTime()) ? null : timestamp,
    message: match[2],
  };
};

// Individual terminal line component with highlighting and tooltip
export function TerminalLine({
  log,
  noTimestamp,
  searchTerm,
}: {
  log: LogLine;
  noTimestamp?: boolean;
  searchTerm?: string;
}) {
  const { timestamp, message } = log;
  const { type, variant } = getLogType(message);

  const formattedTime = timestamp
    ? timestamp.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "---";

  const highlightMessage = (text: string, term: string) => {
    const escapedTerm = term.trim();
    if (!escapedTerm) return text;

    const expression = new RegExp(
      `(${escapedTerm.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")})`,
      "gi",
    );
    return text.split(expression).map((part, index) =>
      index % 2 === 1 ? (
        <mark
          className="rounded bg-warning/20 px-0.5 font-semibold text-foreground"
          key={`${part}-${index}`}
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  return (
    <div
      className={cn(
        "flex gap-3 border-l-2 px-2 py-1 font-mono text-xs",
        type === "error"
          ? "border-destructive bg-destructive/10 hover:bg-destructive/15"
          : type === "warning"
            ? "border-warning bg-warning/10 hover:bg-warning/15"
            : type === "debug"
              ? "border-muted-foreground/30 bg-muted/50 hover:bg-muted"
              : type === "success"
                ? "border-primary bg-primary/10 hover:bg-primary/15"
                : "border-transparent hover:bg-muted/60",
      )}
    >
      {!noTimestamp && (
        <span className="w-20 shrink-0 select-none text-muted-foreground">
          {formattedTime}
        </span>
      )}
      <Badge
        variant={variant}
        className="h-4 w-14 shrink-0 justify-center px-1 py-0 font-bold text-[9px] capitalize"
      >
        {type}
      </Badge>
      <span className="flex-1 whitespace-pre-wrap break-all font-mono text-foreground">
        {highlightMessage(message, searchTerm || "")}
      </span>
    </div>
  );
}

interface DockerLogsProps {
  containerId: string;
  logs?: string[];
}

export const ShowDockerLogs = ({ containerId, logs = [] }: DockerLogsProps) => {
  const [logsList, setLogsList] = useState<LogLine[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
  const [linesLimit, setLinesLimit] = useState<number>(100);
  const [timeRange, setTimeRange] = useState<string>("all");
  const [showTimestamp, setShowTimestamp] = useState<boolean>(true);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [messageBuffer, setMessageBuffer] = useState<LogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The API returns the authoritative tail on every poll. Replacing this view
  // avoids duplicate entries when Docker repeats the same log line.
  useEffect(() => {
    if (!isPaused) {
      setLogsList(logs.filter(Boolean).map(parseLogLine));
      setMessageBuffer([]);
    } else {
      setMessageBuffer(logs.filter(Boolean).map(parseLogLine));
    }
  }, [isPaused, logs]);

  // Filter implementation
  useEffect(() => {
    let result = [...logsList];

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((log) =>
        log.message.toLowerCase().includes(query),
      );
    }

    // Time range filter
    if (timeRange !== "all") {
      const cutoff = new Date();
      if (timeRange === "1h") cutoff.setHours(cutoff.getHours() - 1);
      else if (timeRange === "6h") cutoff.setHours(cutoff.getHours() - 6);
      else if (timeRange === "24h") cutoff.setHours(cutoff.getHours() - 24);
      result = result.filter((log) => log.timestamp && log.timestamp >= cutoff);
    }

    // Log type filter
    if (typeFilters.length > 0) {
      result = result.filter((log) => {
        const { type } = getLogType(log.message);
        return typeFilters.includes(type);
      });
    }

    // Apply lines limit
    result = result.slice(-linesLimit);

    setFilteredLogs(result);
  }, [logsList, searchQuery, timeRange, typeFilters, linesLimit]);

  // Scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 15;
    setAutoScroll(isAtBottom);
  };

  const handlePauseResume = () => {
    if (isPaused) {
      if (messageBuffer.length > 0) {
        setLogsList((prev) => [...prev, ...messageBuffer].slice(-500));
        setMessageBuffer([]);
      }
    }
    setIsPaused(!isPaused);
  };

  const handleCopy = () => {
    const text = filteredLogs
      .map((log) =>
        showTimestamp
          ? `${log.timestamp?.toLocaleTimeString()} [${getLogType(log.message).type}] ${log.message}`
          : log.message,
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Logs copied to clipboard");
  };

  const handleDownload = () => {
    const text = filteredLogs
      .map((log) =>
        showTimestamp
          ? `${log.timestamp?.toLocaleTimeString()} [${getLogType(log.message).type}] ${log.message}`
          : log.message,
      )
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `container-${containerId}-logs.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filters & Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-2.5">
        <div className="flex flex-wrap gap-2">
          {/* Limit Filter */}
          <Popover>
            <PopoverTrigger className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border/40 bg-transparent px-3 py-1 font-medium text-foreground text-xs transition-colors hover:bg-muted/10">
              <Hash className="size-3.5 text-muted-foreground" />
              <span>Limit: {linesLimit}</span>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="start">
              {[100, 300, 500, 1000].map((num) => (
                <button
                  key={num}
                  onClick={() => setLinesLimit(num)}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/10",
                    linesLimit === num && "bg-muted/5 font-bold text-primary",
                  )}
                >
                  <span>{num} lines</span>
                  {linesLimit === num && <Check className="size-3.5" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Time range Popover */}
          <Popover>
            <PopoverTrigger className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border/40 bg-transparent px-3 py-1 font-medium text-foreground text-xs transition-colors hover:bg-muted/10">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>
                Range:{" "}
                {timeRange === "all"
                  ? "All time"
                  : timeRange === "1h"
                    ? "Last hour"
                    : `Last ${timeRange}`}
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-48 space-y-2 p-1.5" align="start">
              <div className="space-y-0.5">
                {[
                  { label: "All time", value: "all" },
                  { label: "Last hour", value: "1h" },
                  { label: "Last 6 hours", value: "6h" },
                  { label: "Last 24 hours", value: "24h" },
                ].map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setTimeRange(item.value)}
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/10",
                      timeRange === item.value &&
                        "bg-muted/5 font-bold text-primary",
                    )}
                  >
                    <span>{item.label}</span>
                    {timeRange === item.value && <Check className="size-3.5" />}
                  </button>
                ))}
              </div>
              <Separator />
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] text-muted-foreground">
                  Show Timestamps
                </span>
                <Switch
                  checked={showTimestamp}
                  onCheckedChange={setShowTimestamp}
                  className="scale-75"
                />
              </div>
            </PopoverContent>
          </Popover>

          {/* Log Level Popover */}
          <Popover>
            <PopoverTrigger className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border/40 bg-transparent px-3 py-1 font-medium text-foreground text-xs transition-colors hover:bg-muted/10">
              <Filter className="size-3.5 text-muted-foreground" />
              <span>Level ({typeFilters.length || "All"})</span>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="start">
              <button
                onClick={() => setTypeFilters([])}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/10",
                  typeFilters.length === 0 && "font-bold text-primary",
                )}
              >
                <span>All Levels</span>
                {typeFilters.length === 0 && <Check className="size-3.5" />}
              </button>
              <Separator className="my-1" />
              {priorities.map((item) => {
                const isSelected = typeFilters.includes(item.value);
                return (
                  <button
                    key={item.value}
                    onClick={() => {
                      if (isSelected) {
                        setTypeFilters((prev) =>
                          prev.filter((v) => v !== item.value),
                        );
                      } else {
                        setTypeFilters((prev) => [...prev, item.value]);
                      }
                    }}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/10"
                  >
                    <span className="capitalize">{item.label}</span>
                    {isSelected && <Check className="size-3.5 text-primary" />}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>

          {/* Search bar */}
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs"
            aria-label="Search logs"
            className="h-8 w-44 bg-background text-xs"
          />
        </div>

        {/* Actions panel */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePauseResume}
            className="h-8 gap-1.5 border-border/40 text-xs"
          >
            {isPaused ? (
              <Play className="size-3.5 text-primary" />
            ) : (
              <Pause className="size-3.5 text-warning" />
            )}
            <span>{isPaused ? "Resume" : "Pause"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={filteredLogs.length === 0}
            className="h-8 gap-1.5 border-border/40 text-xs"
          >
            <Copy className="size-3.5 text-muted-foreground" />
            <span>Copy</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={filteredLogs.length === 0}
            className="h-8 gap-1.5 border-border/40 text-xs"
          >
            <Download className="size-3.5 text-muted-foreground" />
            <span>Download</span>
          </Button>
        </div>
      </div>

      {/* Paused alert panel */}
      {isPaused && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-warning text-xs">
          <Pause className="size-3.5 animate-pulse" />
          <span>
            Streaming is paused.{" "}
            {messageBuffer.length > 0
              ? `(${messageBuffer.length} messages buffered)`
              : "No new messages"}
          </span>
        </div>
      )}

      {/* Terminal log panel */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="custom-logs-scrollbar h-96 space-y-0.5 overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-[11px]"
      >
        {filteredLogs.length > 0 ? (
          filteredLogs.map((logItem, index) => (
            <TerminalLine
              key={`${logItem.rawTimestamp ?? "untimed"}-${index}`}
              log={logItem}
              noTimestamp={!showTimestamp}
              searchTerm={searchQuery}
            />
          ))
        ) : (
          <div className="flex h-full items-center justify-center font-sans text-muted-foreground text-xs">
            No matching logs found.
          </div>
        )}
      </div>
    </div>
  );
};
