import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PenLine, Send, Sparkles, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SegmentedControl,
  SegmentedControlItem,
  Switch,
  Text,
  Textarea,
  toast,
} from "@glaze/core/components";
import { useGlazeAI } from "@glaze/core/hooks";
import { cn } from "@glaze/core/utils";

import { api } from "../lib/api";
import type { FediverseVisibility, MastodonStatus } from "../lib/types";

type ComposerMode = "compose" | "assistant";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const BLOCKED_MESSAGE: Record<string, string> = {
  "needs-consent": "AI access wasn't allowed. Try asking again when you're ready.",
  "signed-out": "Sign in to Glaze to chat with the assistant.",
  "needs-subscription": "This needs an upgraded Glaze plan. Try again to see options.",
  "insufficient-credits": "You're out of Glaze AI credits for now.",
  "daily-limit-reached": "You've reached today's AI limit for this app.",
  "host-unavailable": "Glaze couldn't be reached. Try again.",
  disabled: "AI is currently unavailable for this account.",
};

function AssistantPanel({ onUseInComposer }: { onUseInComposer: (content: string) => void }) {
  const { streamText, state, enableInHost } = useGlazeAI();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => () => abortControllerRef.current?.abort(), []);
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || state === "loading") return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    const history = [...messages, userMessage];
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");

    try {
      await streamText({
        model: "fast",
        system:
          "You are a warm, concise writing assistant helping the user draft short posts (roughly 500 characters) to share on the Fediverse. Offer a couple of concrete phrasing options when it helps, and keep the tone conversational otherwise.",
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        maxOutputTokens: 500,
        abortSignal: controller.signal,
        onTextDelta: (delta) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
          ),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const errorState =
        error && typeof error === "object" && "state" in error
          ? String((error as { state: unknown }).state)
          : null;
      if (errorState === "host-unavailable") {
        await enableInHost();
        return;
      }
      const message =
        (errorState && BLOCKED_MESSAGE[errorState]) || "Something went wrong. Try again.";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: message } : m)),
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <Text color="tertiary" className="px-1 py-6 text-center">
          Ask for help finding the words — a hook for a story, a reply, or just to think out loud.
        </Text>
      ) : (
        <div className="flex flex-col gap-2.5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "flex max-w-[85%] flex-col items-start gap-1.5 rounded-card px-3 py-2",
                  m.role === "user" ? "bg-accent" : "bg-well",
                )}
              >
                <Text
                  variant="small"
                  className={cn("whitespace-pre-wrap", m.role === "user" && "text-accent-contrast")}
                >
                  {m.content || "…"}
                </Text>
                {m.role === "assistant" && m.content ? (
                  <Button
                    size="small"
                    variant="transparent"
                    className="-ml-2"
                    onClick={() => onUseInComposer(m.content)}
                  >
                    Use in composer
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
      <div className="flex items-end gap-2 border-t border-separator pt-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the assistant…"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <Button
          size="medium"
          variant="accent"
          iconOnly
          aria-label="Send"
          disabled={state === "loading" || !input.trim()}
          onClick={() => void handleSend()}
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}

export function FediverseComposer({
  open,
  onOpenChange,
  replyTo,
  onCancelReply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replyTo: MastodonStatus | null;
  onCancelReply: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<ComposerMode>("compose");
  const [text, setText] = React.useState("");
  const [cwEnabled, setCwEnabled] = React.useState(false);
  const [cw, setCw] = React.useState("");
  const [visibility, setVisibility] = React.useState<FediverseVisibility>("public");

  React.useEffect(() => {
    if (!open) return;
    setMode("compose");
    setText("");
    setCw("");
    setCwEnabled(false);
    setVisibility("public");
  }, [open]);

  const post = useMutation({
    mutationFn: () =>
      api.fedipod.post({
        status: text.trim(),
        spoilerText: cwEnabled ? cw.trim() || "Sensitive content" : null,
        visibility,
        inReplyToId: replyTo?.id ?? null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "timeline"] });
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "notifications"] });
      toast.success(replyTo ? "Reply posted" : "Posted to the Fediverse");
      onCancelReply();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not post"),
  });

  const handleUseInComposer = (content: string) => {
    setText((current) => (current ? `${current}\n\n${content}` : content));
    setMode("compose");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{replyTo ? "Reply" : "Compose"}</DialogTitle>
          <SegmentedControl
            value={mode}
            onValueChange={(v) => setMode(v as ComposerMode)}
            size="small"
            className="mt-2 self-start"
            aria-label="Composer mode"
          >
            <SegmentedControlItem value="compose">
              <PenLine />
              Compose
            </SegmentedControlItem>
            <SegmentedControlItem value="assistant">
              <Sparkles />
              Assistant
            </SegmentedControlItem>
          </SegmentedControl>
        </DialogHeader>
        <DialogBody maxHeight="440px">
          {mode === "compose" ? (
            <div className="flex flex-col gap-3">
              {replyTo ? (
                <div className="flex items-center gap-2 rounded-card border border-secondary bg-well/40 px-3 py-2">
                  <Text variant="small" color="tertiary" truncate className="min-w-0 flex-1">
                    Replying to @{replyTo.account.acct || replyTo.account.username}
                  </Text>
                  <Button
                    size="small"
                    variant="transparent"
                    iconOnly
                    aria-label="Cancel reply"
                    onClick={onCancelReply}
                  >
                    <X />
                  </Button>
                </div>
              ) : null}
              {cwEnabled ? (
                <Input
                  value={cw}
                  onChange={(e) => setCw(e.target.value)}
                  placeholder="Content warning"
                />
              ) : null}
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={replyTo ? "Write your reply…" : "Share something with the Fediverse…"}
                size="large"
                autoFocus
              />
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  size="small"
                  value={visibility}
                  onValueChange={(v) => setVisibility(v as FediverseVisibility)}
                  aria-label="Visibility"
                >
                  <SegmentedControlItem value="public">Public</SegmentedControlItem>
                  <SegmentedControlItem value="unlisted">Unlisted</SegmentedControlItem>
                  <SegmentedControlItem value="private">Followers</SegmentedControlItem>
                </SegmentedControl>
                <Label className="ml-1 gap-2">
                  <Switch
                    checked={cwEnabled}
                    onCheckedChange={setCwEnabled}
                    aria-label="Content warning"
                  />
                  CW
                </Label>
              </div>
            </div>
          ) : (
            <AssistantPanel onUseInComposer={handleUseInComposer} />
          )}
        </DialogBody>
        {mode === "compose" ? (
          <DialogFooter>
            <Button variant="filled" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={post.isPending || !text.trim()}
              onClick={() => post.mutate()}
            >
              <Send />
              {replyTo ? "Reply" : "Post"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
