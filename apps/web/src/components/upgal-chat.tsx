"use client";

import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useChat } from "@ai-sdk/react";
import {
  Bot,
  Check,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import { Textarea } from "@upstand/ui/components/textarea";
import { trpc } from "@/utils/trpc";
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

type UpGalChatProps = { organizationId?: string };

function Part({
  part,
  approve,
}: {
  part: any;
  approve: (id: string, approved: boolean) => void;
}) {
  if (part.type === "text")
    return <MessageResponse>{part.text}</MessageResponse>;
  if (part.type?.startsWith("tool-")) {
    const name = part.toolName || part.type.slice(5);
    const approval = part.approval;
    return (
      <Tool
        defaultOpen={part.state !== "output-available"}
        className="my-2 w-full"
      >
        <ToolHeader type={name} state={part.state} />
        <ToolContent>
          <ToolInput input={part.input} />
          {approval && part.state === "approval-requested" ? (
            <div className="flex items-center gap-2 border-t p-3">
              <span className="mr-auto text-xs text-muted-foreground">
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
          {part.output !== undefined ? (
            <ToolOutput output={part.output} errorText={part.errorText} />
          ) : null}
        </ToolContent>
      </Tool>
    );
  }
  return null;
}

export function UpGalChat({ organizationId }: UpGalChatProps) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [draft, setDraft] = useState("");
  const createConversation = useMutation(
    trpc.ai.createConversation.mutationOptions(),
  );
  const conversations = useQuery({
    ...trpc.ai.conversations.queryOptions({
      organizationId: organizationId || "",
    }),
    enabled: Boolean(organizationId),
  });

  const transport = new DefaultChatTransport({
    api: "/api/ai/chat",
    credentials: "include",
    body: { organizationId },
  });
  const chat = useChat({
    transport,
    sendAutomaticallyWhen: ({ messages }) =>
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages }),
  });

  useEffect(() => {
    if (!organizationId || conversationId) return;
    const latest = conversations.data?.[0];
    if (latest) setConversationId(latest.id);
  }, [organizationId, conversationId, conversations.data]);

  async function ensureConversation() {
    if (conversationId || !organizationId) return conversationId;
    const result = await createConversation.mutateAsync({ organizationId });
    setConversationId(result.id);
    return result.id;
  }

  async function send() {
    const text = draft.trim();
    if (!text || !organizationId) return;
    const id = await ensureConversation();
    setDraft("");
    await chat.sendMessage(
      { text },
      { body: { organizationId, conversationId: id } },
    );
  }

  function newConversation() {
    setConversationId(undefined);
    chat.setMessages([]);
  }

  return (
    <>
      {!open ? (
        <Button
          aria-label="Open UpGal assistant"
          className="fixed bottom-5 right-5 z-50 size-14 rounded-full shadow-lg"
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
              <p className="text-xs text-muted-foreground">
                Your Upstand operations assistant
              </p>
            </div>
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
                          void chat.addToolApprovalResponse({ id, approved })
                        }
                      />
                    ))}
                  </MessageContent>
                </Message>
              ))}
              {chat.status === "submitted" || chat.status === "streaming" ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  UpGal is working…
                </div>
              ) : null}
              {chat.error ? (
                <p className="text-sm text-destructive">{chat.error.message}</p>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <form
            className="border-t p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="flex items-end gap-2 rounded-lg border p-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask UpGal anything…"
                className="min-h-10 resize-none border-0 p-1 shadow-none focus-visible:ring-0"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!draft.trim() || chat.status === "streaming"}
              >
                <Send className="size-4" />
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              UpGal asks before making changes.
            </p>
          </form>
        </section>
      )}
    </>
  );
}
