import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";

interface Source {
  title: string;
  reference: string;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
}

const ChatMessage = ({ role, content, sources, isStreaming }: ChatMessageProps) => {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] md:max-w-[70%] ${
          isUser
            ? "bg-accent/60 rounded-2xl rounded-br-sm px-5 py-3"
            : "px-1 py-2"
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-xs font-display font-bold">ॐ</span>
            </div>
            <span className="text-xs text-muted-foreground font-body tracking-wide uppercase">
              Baba
            </span>
          </div>
        )}

        <div className={`font-body text-sm md:text-base leading-relaxed ${
          isUser ? "text-foreground" : "text-foreground/90"
        }`}>
          {content}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-primary/60 ml-1 animate-breathe rounded-sm" />
          )}
        </div>

        {sources && sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen className="w-3 h-3 text-primary/70" />
              <span className="text-xs text-primary/70 font-body tracking-wide uppercase">
                Sources
              </span>
            </div>
            <div className="space-y-1">
              {sources.map((source, i) => (
                <div
                  key={i}
                  className="text-xs text-muted-foreground font-body bg-muted/50 rounded-md px-3 py-1.5"
                >
                  <span className="text-foreground/70 font-medium">{source.title}</span>
                  {source.reference && (
                    <span className="text-muted-foreground"> — {source.reference}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ChatMessage;
