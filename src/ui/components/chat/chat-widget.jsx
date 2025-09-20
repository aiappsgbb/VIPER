"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "ai/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, MessageCircle, Send, X } from "lucide-react";

function sanitizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
}

export default function ChatWidget({
  selectedContent,
  actionSummaryContext,
  chapterAnalysisContext,
}) {
  const [isOpen, setIsOpen] = useState(false);

  const [searchScope, setSearchScope] = useState("video");
  const hasCollectionScope = Boolean(selectedContent?.collection?.id);
  const resolvedSearchScope = hasCollectionScope && searchScope === "collection" ? "collection" : "video";

  useEffect(() => {
    setSearchScope("video");
  }, [selectedContent?.id]);

  useEffect(() => {
    if (!hasCollectionScope) {
      setSearchScope("video");
    }
  }, [hasCollectionScope]);
  const chatBody = useMemo(
    () => ({
      contentId: resolvedSearchScope === "video" ? selectedContent?.id ?? null : null,
      collectionId: selectedContent?.collection?.id ?? null,
      organizationId: selectedContent?.organization?.id ?? null,
      contentTitle: selectedContent?.title ?? null,
      searchScope: resolvedSearchScope,

      actionSummary: sanitizeArray(actionSummaryContext),
      chapterAnalysis: sanitizeArray(chapterAnalysisContext),
    }),
    [
      selectedContent?.id,
      selectedContent?.collection?.id,
      selectedContent?.organization?.id,
      selectedContent?.title,
      actionSummaryContext,
      chapterAnalysisContext,

      resolvedSearchScope,

    ],
  );

  const systemInstructions = useMemo(() => {
    const segments = [
      "You are VIPER's embedded video intelligence assistant.",
      "You study machine-generated JSON describing videos—action summaries, transcripts, and chapter analyses—to answer questions as if you personally watched the footage.",
      "Ground every answer in the provided context, cite timestamps when available, and admit when information is missing instead of guessing.",
    ];
    if (selectedContent?.title) {
      segments.push(
        `When the user references \"this video\" focus on the content titled \"${selectedContent.title}\".`,
      );
    }

    segments.push(
      resolvedSearchScope === "collection"
        ? "You may reference action summaries from any video within the selected collection, but treat chapter analysis details as only describing the currently selected video."
        : "Limit supporting action-summary evidence to this video's timeline while treating chapter analysis data as video-specific.",
    );
    return segments.join(" ");
  }, [resolvedSearchScope, selectedContent?.title]);


  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } =
    useChat({
      api: "/api/chat",
      body: chatBody,
    });

  useEffect(() => {
    setMessages([
      {
        id: "system",
        role: "system",
        content: systemInstructions,
      },
    ]);
  }, [systemInstructions, setMessages]);

  const displayMessages = useMemo(
    () => messages.filter((message) => message.role !== "system"),
    [messages],
  );

  const endOfMessagesRef = useRef(null);
  useEffect(() => {
    if (isOpen && endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const toggleOpen = () => {
    setIsOpen((current) => !current);
  };

  const handleFormSubmit = (event) => {
    if (!input.trim()) {
      event.preventDefault();
      return;
    }
    handleSubmit(event);
  };

  const focusLabel = selectedContent?.title
    ? `Now watching: ${selectedContent.title}`
    : "Ask about this video";


  const scopeDescription =
    resolvedSearchScope === "collection"
      ? "Searching action summaries across this collection."
      : "Searching action summaries within this video.";


  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen ? (
        <div className="pointer-events-auto w-[26rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-[32rem]">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">

            <div className="space-y-2">

              <p className="text-base font-semibold">Ask VIPER</p>
              <p className="text-xs text-slate-200 md:text-sm">
                Intelligent answers sourced from your video analyses.
              </p>
              <p className="truncate text-xs text-slate-300 md:text-sm" title={focusLabel}>
                {focusLabel}
              </p>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">Search scope</span>
                  <div className="flex rounded-full bg-slate-800 p-1">
                    <button
                      aria-pressed={resolvedSearchScope === "video"}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition",
                        resolvedSearchScope === "video"
                          ? "bg-white text-slate-900 shadow"
                          : "text-slate-200 hover:bg-slate-700/80",
                      )}
                      onClick={() => setSearchScope("video")}
                      type="button"
                    >
                      This video
                    </button>
                    {hasCollectionScope ? (
                      <button
                        aria-pressed={resolvedSearchScope === "collection"}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium transition",
                          resolvedSearchScope === "collection"
                            ? "bg-white text-slate-900 shadow"
                            : "text-slate-200 hover:bg-slate-700/80",
                        )}
                        onClick={() => setSearchScope("collection")}
                        type="button"
                      >
                        Collection
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="text-[11px] text-slate-300">{scopeDescription}</p>
              </div>

            </div>
            <Button
              aria-label="Close chat"
              className="h-8 w-8 text-white hover:bg-slate-800"
              onClick={toggleOpen}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex h-[32rem] flex-col">
            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-4">
                {displayMessages.length === 0 ? (
                  <div className="rounded-lg bg-slate-100 p-5 text-sm text-slate-600">
                    Ask about people, actions, or chapters to get an answer that references the exact moment in the video.
                  </div>
                ) : (
                  displayMessages.map((message, index) => {
                    const isAssistant = message.role === "assistant";
                    const linkClassName = cn(
                      "font-medium underline underline-offset-2 transition-colors",
                      isAssistant
                        ? "text-slate-100 hover:text-slate-300"
                        : "text-slate-800 hover:text-slate-600",
                    );
                    const codeClassName = cn(
                      "rounded px-1.5 py-0.5 font-mono text-[0.75rem]",
                      isAssistant
                        ? "bg-slate-800/80 text-slate-100"
                        : "bg-slate-200 text-slate-800",
                    );
                    return (
                      <div
                        className={cn("flex", isAssistant ? "justify-start" : "justify-end")}
                        key={message.id ?? `message-${index}`}
                      >
                        <div
                          className={cn(
                            "max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md",
                            isAssistant
                              ? "bg-slate-900 text-slate-100"
                              : "bg-slate-100 text-slate-800",
                          )}
                        >
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            {isAssistant ? "Assistant" : "You"}
                          </p>
                          <ReactMarkdown
                            className={cn(
                              "prose prose-sm max-w-none break-words",
                              isAssistant
                                ? "prose-invert prose-p:text-slate-100 prose-headings:text-slate-100 prose-strong:text-white"
                                : "prose-slate",
                            )}
                            linkTarget="_blank"
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, ...props }) => <a {...props} className={linkClassName} />,
                              code: ({ node, inline, className, children, ...props }) => (
                                <code
                                  {...props}
                                  className={cn(
                                    codeClassName,
                                    className,
                                    inline ? "" : "mt-2 block whitespace-pre-wrap",
                                  )}
                                >
                                  {inline ? children : String(children).replace(/\n$/, "")}
                                </code>
                              ),
                            }}
                          >
                            {message.content ?? ""}
                          </ReactMarkdown>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endOfMessagesRef} />
              </div>
            </ScrollArea>
            <form className="border-t border-slate-200 bg-slate-50 p-4" onSubmit={handleFormSubmit}>
              <Textarea
                onChange={handleInputChange}
                placeholder="Ask the assistant about what happens in the footage…"
                rows={4}
                value={input}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 md:text-sm">Shift + Enter for a new line.</p>
                <Button
                  className="gap-2 px-4 text-sm"
                  disabled={isLoading || !input.trim()}
                  size="sm"
                  type="submit"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <Button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="pointer-events-auto h-14 rounded-full px-6 text-base shadow-lg"
        onClick={toggleOpen}
        type="button"
      >
        <MessageCircle className="mr-2 h-5 w-5" />
        Ask AI
      </Button>
    </div>
  );
}
