import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import SuggestedQuestions from "@/components/SuggestedQuestions";
import BreathingLoader from "@/components/BreathingLoader";
import heroBg from "@/assets/hero-bg.jpg";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; reference: string }[];
}

// Mock response for demo — will be replaced with RAG backend
const getMockResponse = (question: string): Promise<Message> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        role: "assistant",
        content:
          "The mind is the subtle expression of the body. It is through the mind that consciousness interacts with the material world. The mind has layers — the conscious, subconscious, and superconscious — each playing a role in our spiritual evolution. Through regular meditation practice, one can transcend the limitations of the crude mind and move toward the infinite awareness that is our true nature.",
        sources: [
          { title: "Ananda Marga Philosophy in a Nutshell", reference: "Part 4, Chapter 7" },
          { title: "Subháśita Saḿgraha", reference: "Part 1, Discourse 3" },
        ],
      });
    }, 2000);
  });
};

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (input: string) => {
    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await getMockResponse(input);
      setMessages((prev) => [...prev, response]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm sorry, I was unable to find an answer in Baba's writings for this question. Please try rephrasing.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] opacity-[0.06]">
          <img src={heroBg} alt="" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-center py-4 px-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
            <span className="text-primary text-sm font-display font-bold">ॐ</span>
          </div>
          <h1 className="text-lg font-display font-semibold text-foreground tracking-wide">
            Baba GPT
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col relative z-10">
        {!hasMessages ? (
          /* Welcome screen */
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
          /* Chat messages */
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-6">
              <AnimatePresence>
                {messages.map((msg, i) => (
                  <ChatMessage key={i} {...msg} />
                ))}
              </AnimatePresence>
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <BreathingLoader />
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="sticky bottom-0 py-4 bg-gradient-to-t from-background via-background to-transparent">
          <ChatInput onSend={handleSend} isLoading={isLoading} />
        </div>
      </main>
    </div>
  );
};

export default Index;
