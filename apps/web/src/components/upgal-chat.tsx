"use client";

import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpGalUIMessage } from "@upstand/api/ai/upgal";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@upstand/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@upstand/ui/components/alert-dialog";
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
import { useCallback, useEffect, useRef, useState } from "react";
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
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { UpGalToolOutput } from "@/components/upgal-tool-output";
import { getServerUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

type UpGalChatProps = { organizationId?: string };

const conversationDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function displayChatError(error: Error): string {
  if (error.message === "An error occurred.") {
    return "UpGal could not complete this response. Completed tool results remain available above; retry to continue.";
  }
  return error.message;
}

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
    const hasInput =
      part.input !== undefined &&
      (typeof part.input !== "object" ||
        part.input === null ||
        Object.keys(part.input).length > 0);
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
          {hasInput ? <ToolInput input={part.input} /> : null}
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
                <X data-icon="inline-start" />
                Reject
              </Button>
              <Button size="sm" onClick={() => approve(approval.id, true)}>
                <Check data-icon="inline-start" />
                Approve
              </Button>
            </div>
          ) : null}
          {part.state === "output-available" ? (
            <UpGalToolOutput name={toolName} output={part.output} />
          ) : part.state === "output-error" ? (
            <ToolOutput output={undefined} errorText={part.errorText} />
          ) : null}
        </ToolContent>
      </Tool>
    );
  }
  return null;
}

export function UpGalChat({ organizationId }: UpGalChatProps) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  }>();
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

  async function ensureConversation() {
    if (conversationId || !organizationId) return conversationId;
    const result = await createConversation.mutateAsync({ organizationId });
    setConversationId(result.id);
    void conversations.refetch();
    return result.id;
  }

  const loadConversation = useCallback(
    async (id: string) => {
      if (!organizationId || loadedConversationId.current.value === id) return;
      try {
        setLoadError(undefined);
        const result = await queryClient.fetchQuery(
          trpc.ai.getConversation.queryOptions({
            organizationId,
            conversationId: id,
          }),
        );
        if (!result) {
          setLoadError("This conversation is no longer available.");
          return;
        }
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
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load this conversation.",
        );
      }
    },
    [chat, organizationId, queryClient],
  );

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
  }, [
    conversationId,
    conversations.data,
    loadConversation,
    open,
    organizationId,
  ]);

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
    setLoadError(undefined);
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
                    <Loader2
                      aria-hidden="true"
                      className="size-3 animate-spin"
                    />
                  ) : null}
                </div>
                <ScrollArea className="max-h-64">
                  <div className="flex flex-col gap-1">
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
                            <span className="block text-[11px] text-muted-foreground">
                              {conversationDateFormatter.format(
                                new Date(conversation.updatedAt),
                              )}
                            </span>
                          </button>
                          <Button
                            aria-label={`Remove ${conversation.title || "conversation"}`}
                            size="icon-sm"
                            variant="ghost"
                            onClick={() =>
                              setDeleteTarget({
                                id: conversation.id,
                                title:
                                  conversation.title || "UpGal conversation",
                              })
                            }
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
                  title="What should I inspect?"
                  description="Ask UpGal to list projects, inspect environments, read logs, or check Docker. Any change requires your approval."
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
                  <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                  UpGal is inspecting your infrastructure…
                </div>
              ) : null}
              {loadError ? (
                <Alert variant="destructive">
                  <AlertTitle>Conversation unavailable</AlertTitle>
                  <AlertDescription>{loadError}</AlertDescription>
                </Alert>
              ) : null}
              {chat.error ? (
                <Alert variant="destructive">
                  <AlertTitle>UpGal could not finish that request</AlertTitle>
                  <AlertDescription>
                    <span>{displayChatError(chat.error)}</span>
                    <Button
                      className="mt-2"
                      onClick={() => void chat.regenerate()}
                      size="sm"
                      variant="outline"
                    >
                      Retry response
                    </Button>
                  </AlertDescription>
                </Alert>
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
              UpGal will ask before making any changes.
            </p>
          </PromptInput>
        </section>
      )}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” and its saved tool results will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget || !organizationId) return;
                deleteConversation.mutate({
                  organizationId,
                  conversationId: deleteTarget.id,
                });
                setDeleteTarget(undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
