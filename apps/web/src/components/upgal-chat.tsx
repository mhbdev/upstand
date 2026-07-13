"use client";

import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpGalUIMessage } from "@upstand/api/ai/upgal";
import { Button } from "@upstand/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@upstand/ui/components/popover";
import { ScrollArea } from "@upstand/ui/components/scroll-area";
import {
  DefaultChatTransport,
  getToolName,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import {
  Bot,
  Check,
  History,
  Loader2,
  MessageCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { getServerUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

type UpGalChatProps = { organizationId?: string };

function Part({
  part,
  approve,
}: {
  part: UpGalUIMessage["parts"][number];
  approve: (id: string, approved: boolean) => void;
}) {
  if (isTextUIPart(part)) return <MessageResponse>{part.text}</MessageResponse>;
  if (isToolUIPart(part)) {
    const toolName =
      part.type === "dynamic-tool" ? getToolName(part) : getToolName(part);
    const approval = part.approval;
    return (
      <Tool
        defaultOpen={part.state !== "output-available"}
        className="my-2 w-full"
      >
        {part.type === "dynamic-tool" ? (
          <ToolHeader
            type="dynamic-tool"
            toolName={toolName}
            state={part.state}
          />
        ) : (
          <ToolHeader type={part.type} state={part.state} />
        )}
        <ToolContent>
          <ToolInput input={part.input} />
          {approval && part.state === "approval-requested" ? (
            <div
              className="flex items-center gap-2 border-t p-3"
              role="status"
              aria-live="polite"
            >
              <span className="mr-auto text-muted-foreground text-xs">
                UpGal is waiting for your approval.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => approve(approval.id, false)}
              >
                <X className="mr-1 size-3" />
                Reject
              </Button>
              <Button size="sm" onClick={() => approve(approval.id, true)}>
                <Check className="mr-1 size-3" />
                Approve
              </Button>
            </div>
          ) : null}
          {part.state === "output-available" ? (
            <AdaptiveToolOutput name={toolName} output={part.output} />
          ) : part.state === "output-error" ? (
            <ToolOutput output={undefined} errorText={part.errorText} />
          ) : null}
        </ToolContent>
      </Tool>
    );
  }
  return null;
}

function AdaptiveToolOutput({
  name,
  output,
}: {
  name: string;
  output: unknown;
}) {
  const records = Array.isArray(output)
    ? output.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
    : [];
  if (records.length > 0 && records.length <= 12) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {name.replaceAll("_", " ")}
          </h4>
          <span className="text-muted-foreground text-xs">
            {records.length} result{records.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {records.map((record, index) => {
            const title = String(
              record.name ??
                record.appName ??
                record.hostname ??
                record.id ??
                `Result ${index + 1}`,
            );
            const detail = record.status ?? record.type ?? record.ipAddress;
            return (
              <div
                key={`${title}-${index}`}
                className="rounded-md border bg-muted/30 p-2"
              >
                <p className="truncate font-medium text-sm">{title}</p>
                {detail ? (
                  <p className="mt-0.5 truncate text-muted-foreground text-xs">
                    {String(detail)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <ToolOutput output={output} errorText={undefined} />
      </div>
    );
  }
  return <ToolOutput output={output} errorText={undefined} />;
}

export function UpGalChat({ organizationId }: UpGalChatProps) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const queryClient = useQueryClient();
  const loadedConversationId = useRef<{ value?: string }>({});
  const manualNewConversation = useRef(false);
  const createConversation = useMutation(
    trpc.ai.createConversation.mutationOptions(),
  );
  const deleteConversation = useMutation({
    ...trpc.ai.deleteConversation.mutationOptions(),
    onSuccess: (_, variables) => {
      void conversations.refetch();
      queryClient.removeQueries({
        queryKey: trpc.ai.getConversation.queryKey({
          organizationId: organizationId || "",
          conversationId: variables.conversationId,
        }),
      });
      if (variables.conversationId === conversationId) newConversation();
    },
  });
  const conversations = useQuery({
    ...trpc.ai.conversations.queryOptions({
      organizationId: organizationId || "",
    }),
    enabled: Boolean(organizationId),
  });

  const transport = new DefaultChatTransport<UpGalUIMessage>({
    // UpGal is served by the API origin in self-hosted deployments. Using a
    // relative URL sends the request to the Next.js dashboard and returns its
    // HTML 404 page instead of an AI stream.
    api: `${getServerUrl()}/api/ai/chat`,
    credentials: "include",
    body: { organizationId },
  });
  const chat = useChat<UpGalUIMessage>({
    transport,
    sendAutomaticallyWhen: ({ messages }) =>
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages }),
  });

  useEffect(() => {
    if (
      !organizationId ||
      !open ||
      conversationId ||
      manualNewConversation.current ||
      !conversations.data?.[0]
    )
      return;
    void loadConversation(conversations.data[0].id);
  }, [organizationId, open, conversationId, conversations.data]);

  async function ensureConversation() {
    if (conversationId || !organizationId) return conversationId;
    const result = await createConversation.mutateAsync({ organizationId });
    setConversationId(result.id);
    return result.id;
  }

  async function loadConversation(id: string) {
    if (!organizationId || loadedConversationId.current.value === id) return;
    const result = await queryClient.fetchQuery(
      trpc.ai.getConversation.queryOptions({
        organizationId,
        conversationId: id,
      }),
    );
    if (!result) return;
    setConversationId(id);
    manualNewConversation.current = false;
    loadedConversationId.current.value = id;
    chat.setMessages(
      result.messages.map((message) => ({
        id: message.id,
        role: message.role as UpGalUIMessage["role"],
        parts: message.parts as UpGalUIMessage["parts"],
      })),
    );
    setHistoryOpen(false);
  }

  async function send(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText || !organizationId) return;
    const id = await ensureConversation();
    await chat.sendMessage(
      { text: trimmedText },
      { body: { organizationId, conversationId: id } },
    );
  }

  function newConversation() {
    setConversationId(undefined);
    loadedConversationId.current.value = undefined;
    manualNewConversation.current = true;
    chat.setMessages([]);
    setHistoryOpen(false);
  }

  return (
    <>
      {!open ? (
        <Button
          aria-label="Open UpGal assistant"
          className="fixed right-5 bottom-5 z-50 size-14 rounded-full shadow-lg"
          onClick={() => setOpen(true)}
        >
          <MessageCircle className="size-6" />
        </Button>
      ) : (
        <section className="fixed inset-x-3 bottom-3 z-50 flex h-[min(720px,calc(100svh-24px))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[440px]">
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </div>
            <div className="mr-auto">
              <p className="font-semibold">UpGal</p>
              <p className="text-muted-foreground text-xs">
                Your Upstand operations assistant
              </p>
            </div>
            <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
              <PopoverTrigger
                render={
                  <Button
                    aria-label="Conversation history"
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <History className="size-4" />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[min(88vw,340px)] gap-2 p-2"
              >
                <div className="flex items-center justify-between px-2 py-1">
                  <p className="font-semibold text-sm">
                    Previous conversations
                  </p>
                  {conversations.isFetching ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                </div>
                <ScrollArea className="max-h-64">
                  <div className="space-y-1">
                    {conversations.data?.length ? (
                      conversations.data.map((conversation) => (
                        <div
                          key={conversation.id}
                          className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() =>
                              void loadConversation(conversation.id)
                            }
                          >
                            <span className="block truncate font-medium text-sm">
                              {conversation.title || "UpGal conversation"}
                            </span>
                            <span className="block text-muted-foreground text-[11px]">
                              {new Date(
                                conversation.updatedAt,
                              ).toLocaleString()}
                            </span>
                          </button>
                          <Button
                            aria-label={`Remove ${conversation.title || "conversation"}`}
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => {
                              if (
                                confirm(
                                  "Remove this conversation and its messages?",
                                )
                              ) {
                                deleteConversation.mutate({
                                  organizationId: organizationId || "",
                                  conversationId: conversation.id,
                                });
                              }
                            }}
                            disabled={deleteConversation.isPending}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="px-2 py-6 text-center text-muted-foreground text-xs">
                        No saved conversations yet.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <Button
              aria-label="New conversation"
              size="icon"
              variant="ghost"
              onClick={newConversation}
            >
              <Plus className="size-4" />
            </Button>
            <Button
              aria-label="Close UpGal"
              size="icon"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </header>
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="gap-4 p-4">
              {chat.messages.length === 0 ? (
                <ConversationEmptyState
                  icon={<Bot className="size-8" />}
                  title="How can I help?"
                  description="Ask me to inspect or manage your Upstand infrastructure."
                />
              ) : null}
              {chat.messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.parts.map((part, index) => (
                      <Part
                        key={`${message.id}-${index}`}
                        part={part}
                        approve={(id, approved) =>
                          void chat.addToolApprovalResponse({
                            id,
                            approved,
                            options: {
                              body: { organizationId, conversationId },
                            },
                          })
                        }
                      />
                    ))}
                  </MessageContent>
                </Message>
              ))}
              {chat.status === "submitted" || chat.status === "streaming" ? (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="size-3 animate-spin" />
                  UpGal is working…
                </div>
              ) : null}
              {chat.error ? (
                <p className="text-destructive text-sm">{chat.error.message}</p>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <PromptInput
            className="border-t p-3"
            onSubmit={({ text }) => send(text)}
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Ask UpGal anything…"
                className="min-h-12 resize-none"
                aria-label="Message UpGal"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <span className="px-2 text-[11px] text-muted-foreground">
                Shift + Enter for a new line
              </span>
              <PromptInputSubmit
                status={chat.status}
                onStop={() => chat.stop()}
              />
            </PromptInputFooter>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              UpGal asks before making changes.
            </p>
          </PromptInput>
        </section>
      )}
    </>
  );
}
