import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, User as UserIcon } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { inAppChatService, type ChatMessage } from "@/services/in-app-chat-service";
import { useAuthStore } from "@/store/auth-store";

export function ChatAssistantPage() {
  const user = useAuthStore((state) => state.user);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "👋 **Hello! I'm your Moniilog Assistant.**\n\nYou can chat with me just like on WhatsApp to log transactions, check your balance, or view spending summaries.",
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(textToSend?: string) {
    const query = (textToSend || input).trim();
    if (!query || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsProcessing(true);

    try {
      const reply = await inAppChatService.processMessage(query, user?.id);
      setMessages((prev) => [...prev, reply]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "assistant",
          text: "⚠️ Sorry, I encountered an error processing that message. Please try again.",
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  }

  const suggestionChips = [
    { label: "💰 Check Balance", command: "balance" },
    { label: "🧾 Recent Transactions", command: "recent" },
    { label: "📊 Monthly Summary", command: "summary" },
    { label: "🍔 -2500 Lunch", command: "-2500 food" },
    { label: "🚕 -1500 Taxi", command: "-1500 transport" },
    { label: "💵 +50000 Salary", command: "+50000 salary" }
  ];

  return (
    <PageShell
      title="AI Assistant"
      description="Conversational finance assistant — log expenses, income, and query your ledger naturally."
    >
      <div className="flex flex-col h-[68vh] max-w-4xl mx-auto w-full">
        {/* Chat Messages Container */}
        <Card className="flex-1 overflow-y-auto p-4 my-2 space-y-4 bg-muted/20 border-border/60">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-brand-gradient text-white shadow-sm"
                }`}
              >
                {isUser ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? "bg-primary text-primary-foreground rounded-tr-none"
                    : "bg-card border border-border/70 text-card-foreground rounded-tl-none"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        {isProcessing && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs italic pl-10">
            <Sparkles className="h-3.5 w-3.5 animate-spin text-primary" />
            Moniilog is typing...
          </div>
        )}
        <div ref={messagesEndRef} />
      </Card>

      {/* Suggestion Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {suggestionChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            disabled={isProcessing}
            onClick={() => handleSend(chip.command)}
            className="shrink-0 rounded-full border border-border/80 bg-background/80 hover:bg-muted/60 px-3 py-1 text-xs font-medium text-foreground transition-colors"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2 pt-1"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. -5000 groceries, +50000 bonus, or balance..."
          disabled={isProcessing}
          className="flex-1 bg-background"
        />
        <Button type="submit" disabled={!input.trim() || isProcessing} className="px-5">
          <Send className="h-4 w-4 mr-1.5" />
          Send
        </Button>
      </form>
      </div>
    </PageShell>
  );
}
