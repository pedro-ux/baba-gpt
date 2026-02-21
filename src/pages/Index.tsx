import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Plus, MessageSquare, ChevronLeft, Trash2 } from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import SuggestedQuestions from "@/components/SuggestedQuestions";
import BreathingLoader from "@/components/BreathingLoader";
import { streamChat, type Source, type AnswerType } from "@/lib/chat-stream";
import heroBg from "@/assets/hero-bg.jpg";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  answerType?: AnswerType;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const STORAGE_KEY = "babagpt-conversations";

const loadConversations = (): Conversation[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveConversations = (convos: Conversation[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
};

const getPreviewTitle = (messages: Message[]): string => {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  return first.content.length > 50 ? first.content.slice(0, 50) + "…" : first.content;
};

const Index = () => {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  // Sync messages to conversations in localStorage
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === activeId ? { ...c, messages, title: getPreviewTitle(messages) } : c
      );
      saveConversations(updated);
      return updated;
    });
  }, [messages, activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setActiveId(null);
    setSidebarOpen(false);
  }, []);

  const loadConversation = useCallback((convo: Conversation) => {
    setActiveId(convo.id);
    setMessages(convo.messages);
    setSidebarOpen(false);
  }, []);

  const deleteConversation = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveConversations(updated);
      return updated;
    });
    if (activeId === id) {
      setMessages([]);
      setActiveId(null);
    }
  }, [activeId]);

  const handleSend = async (input: string) => {
    // Create a new conversation if none active
    let currentId = activeId;
    if (!currentId) {
      currentId = crypto.randomUUID();
      const newConvo: Conversation = {
        id: currentId,
        title: input.length > 50 ? input.slice(0, 50) + "…" : input,
        messages: [],
        createdAt: Date.now(),
      };
      setActiveId(currentId);
      setConversations((prev) => {
        const updated = [newConvo, ...prev];
        saveConversations(updated);
        return updated;
      });
    }

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    let assistantContent = "";
    let assistantSources: Source[] = [];
    let assistantAnswerType: AnswerType = "direct";

    const upsertAssistant = (nextChunk: string) => {
      assistantContent += nextChunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1
              ? { ...m, content: assistantContent, sources: assistantSources, answerType: assistantAnswerType }
              : m
          );
        }
        return [
          ...prev,
          { role: "assistant" as const, content: assistantContent, sources: assistantSources, answerType: assistantAnswerType },
        ];
      });
    };

    await streamChat({
      query: input,
      messages: [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      })),
      onDelta: (chunk) => upsertAssistant(chunk),
      onSources: (sources) => {
        assistantSources = sources;
      },
      onAnswerType: (type) => {
        assistantAnswerType = type;
      },
      onDone: () => {
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1 && m.role === "assistant"
              ? { ...m, sources: assistantSources, answerType: assistantAnswerType }
              : m
          )
        );
      },
      onError: (error) => {
        setIsLoading(false);
        toast.error(error);
        setMessages((prev) => [
          ...prev,
          ...(prev[prev.length - 1]?.role !== "assistant"
            ? [
                {
                  role: "assistant" as const,
                  content:
                    "I'm sorry, I was unable to process your question at this time. Please try again.",
                },
              ]
            : []),
        ]);
      },
    });
  };

  return (
    <div className="flex min-h-screen bg-background relative overflow-hidden">
      {/* Sidebar overlay on mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed md:relative z-40 top-0 left-0 h-full w-72 bg-card border-r border-border/40 flex flex-col transition-transform duration-300 ease-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Sidebar header */}
        <div className="p-4 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center">
              <span className="text-primary text-xs font-display font-bold">ॐ</span>
            </div>
            <span className="text-sm font-display font-semibold text-foreground">History</span>
          </div>
          <button
            onClick={startNewConversation}
            className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 text-center py-8 px-4 font-body">
              No conversations yet
            </p>
          ) : (
            conversations.map((convo) => (
              <button
                key={convo.id}
                onClick={() => loadConversation(convo)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 group hover:bg-muted/40 transition-colors ${
                  activeId === convo.id ? "bg-muted/50" : ""
                }`}
              >
                <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-body text-foreground/80 truncate">
                    {convo.title}
                  </p>
                  <p className="text-xs text-muted-foreground/50 font-body mt-0.5">
                    {convo.messages.length} messages
                  </p>
                </div>
                <button
                  onClick={(e) => deleteConversation(convo.id, e)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col relative">
        {/* Background glow */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] opacity-[0.06]">
            <img src={heroBg} alt="" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Header */}
        <header className="relative z-10 flex items-center justify-between py-4 px-4 border-b border-border/30">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors md:hidden"
          >
            <ChevronLeft className={`w-5 h-5 transition-transform ${sidebarOpen ? "" : "rotate-180"}`} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <span className="text-primary text-sm font-display font-bold">ॐ</span>
            </div>
            <h1 className="text-lg font-display font-semibold text-foreground tracking-wide">
              Baba GPT
            </h1>
          </div>
          <button
            onClick={startNewConversation}
            className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title="New conversation"
          >
            <Plus className="w-5 h-5" />
          </button>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col relative z-10">
          {!hasMessages ? (
            <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="text-center mb-10"
              >
                <motion.div
                  className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span className="text-primary text-2xl font-display">ॐ</span>
                </motion.div>
                <h2 className="text-3xl md:text-4xl font-display font-semibold text-foreground mb-3">
                  Ask Baba a question
                </h2>
                <p className="text-muted-foreground font-body text-sm md:text-base max-w-md mx-auto leading-relaxed">
                  Receive answers grounded in the writings and teachings of Sri Sri Anandamurti
                </p>
              </motion.div>

              <SuggestedQuestions onSelect={handleSend} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-6">
              <div className="max-w-3xl mx-auto space-y-6">
                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <ChatMessage
                      key={i}
                      {...msg}
                      isStreaming={
                        isLoading &&
                        i === messages.length - 1 &&
                        msg.role === "assistant"
                      }
                    />
                  ))}
                </AnimatePresence>
                {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <BreathingLoader />
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          <div className="sticky bottom-0 py-4 bg-gradient-to-t from-background via-background to-transparent">
            <ChatInput onSend={handleSend} isLoading={isLoading} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
