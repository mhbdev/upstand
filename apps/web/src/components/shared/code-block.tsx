"use client";

import { Button } from "@upstand/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@upstand/ui/components/tabs";
import { cn } from "@upstand/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { CodeBlock as ShikiCodeBlock } from "@/components/ai-elements/code-block";
import { Check, Copy } from "@/components/huge-icons";
import { copyText } from "@/lib/browser";

export interface CodeBlockTab {
  label: string;
  code: string;
  language: string;
  filename?: string;
}

interface PerfectCodeBlockProps {
  code?: string;
  language?: string;
  filename?: string;
  title?: string;
  tabs?: CodeBlockTab[];
  showLineNumbers?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  language = "javascript",
  filename,
  title,
  tabs,
  showLineNumbers = false,
  className,
}: PerfectCodeBlockProps) {
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  // Multi-tab mode
  if (tabs && tabs.length > 0) {
    const currentTab = tabs[activeTabIdx] || tabs[0];
    const handleCopy = () => {
      void copyText(currentTab.code)
        .then(() => {
          setCopied(true);
          toast.success("Copied to clipboard");
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          toast.error("Failed to copy code snippet");
        });
    };

    return (
      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm dark:bg-zinc-950/80",
          className,
        )}
      >
        {/* Tabs and Actions Header */}
        <div className="flex h-11 items-center justify-between border-border/40 border-b bg-muted/40 px-4 py-1.5 text-muted-foreground">
          <Tabs
            value={String(activeTabIdx)}
            onValueChange={(val) => {
              setActiveTabIdx(Number(val));
              setCopied(false);
            }}
            className="w-auto"
          >
            <TabsList className="h-8 border border-border/20 bg-muted p-0.5">
              {tabs.map((tab, idx) => (
                <TabsTrigger
                  key={`${tab.label}-${idx}`}
                  value={String(idx)}
                  className="h-6.5 px-2.5 font-medium text-[11px] data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            {currentTab.filename && (
              <span className="hidden select-none font-mono text-[10px] text-muted-foreground/60 sm:inline">
                {currentTab.filename}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-7 w-7 text-muted-foreground hover:bg-muted/80 hover:text-foreground dark:hover:bg-zinc-850"
              aria-label={`Copy ${currentTab.label} code snippet`}
            >
              {copied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Shiki highlighted body */}
        <ShikiCodeBlock
          code={currentTab.code}
          language={currentTab.language as any}
          showLineNumbers={showLineNumbers}
          className="m-0 rounded-none border-none bg-transparent shadow-none [&_pre]:p-4"
        />
      </div>
    );
  }

  // Single code snippet mode
  const displayCode = code ?? "";
  const displayLang = language;
  const displayFilename = filename || title;

  const handleCopySingle = () => {
    void copyText(displayCode)
      .then(() => {
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error("Failed to copy code snippet");
      });
  };

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm dark:bg-zinc-950/80",
        className,
      )}
    >
      <div className="flex h-10 items-center justify-between border-border/40 border-b bg-muted/40 px-4 py-2 text-muted-foreground">
        <span className="select-none font-mono text-[11px] text-muted-foreground/80">
          {displayFilename || displayLang.toUpperCase()}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopySingle}
          className="h-7 w-7 text-muted-foreground hover:bg-muted/80 hover:text-foreground dark:hover:bg-zinc-850"
          aria-label="Copy code snippet"
        >
          {copied ? (
            <Check className="size-3.5 text-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>

      <ShikiCodeBlock
        code={displayCode}
        language={displayLang as any}
        showLineNumbers={showLineNumbers}
        className="m-0 rounded-none border-none bg-transparent shadow-none [&_pre]:p-4"
      />
    </div>
  );
}
