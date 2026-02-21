import { motion } from "framer-motion";
import { BookOpen, BookCheck, Lightbulb } from "lucide-react";
import logo from "@/assets/logo.png";
import ReactMarkdown from "react-markdown";
import type { AnswerType } from "@/lib/chat-stream";

interface Source {
  title: string;
  reference: string;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
  answerType?: AnswerType;
}

// Strip the SOURCES: block from the end of AI responses (we display them separately)
const stripSourcesBlock = (text: string) => {
  let cleaned = text;
  // Strip ANSWER_TYPE line
  cleaned = cleaned.replace(/\n?ANSWER[_\s]?TYPE:\s*(DIRECT|INFERRED)\n?/gi, "");
  // Strip SOURCES block
  const sourcesIndex = cleaned.lastIndexOf("SOURCES:");
  if (sourcesIndex !== -1) cleaned = cleaned.slice(0, sourcesIndex);
  return cleaned.trimEnd();
};

const ChatMessage = ({ role, content, sources, isStreaming, answerType }: ChatMessageProps) => {
  const isUser = role === "user";
  const displayContent = isUser ? content : stripSourcesBlock(content);

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
          <div className="flex items-center gap-2 mb-3">
            <img src={logo} alt="Baba" className="w-6 h-6 rounded-full object-cover" />
            <span className="text-xs text-muted-foreground font-body tracking-wide uppercase">
              Baba
            </span>
          </div>
        )}

        {isUser ? (
          <div className="font-body text-sm md:text-base leading-relaxed text-foreground">
            {content}
          </div>
        ) : (
          <div className="font-body text-sm md:text-base leading-relaxed text-foreground/90 prose-baba">
            {answerType && !isStreaming && (
              <div className="mb-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-body font-medium tracking-wide uppercase ${
                    answerType === "direct"
                      ? "bg-primary/15 text-primary border border-primary/20"
                      : "bg-lotus/15 text-lotus border border-lotus/20"
                  }`}
                >
                  {answerType === "direct" ? (
                    <>
                      <BookCheck className="w-3.5 h-3.5" />
                      Direct Source
                    </>
                  ) : (
                    <>
                      <Lightbulb className="w-3.5 h-3.5" />
                      Inferred
                    </>
                  )}
                </span>
              </div>
            )}
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-primary/80">{children}</em>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-primary/40 pl-4 my-3 italic text-foreground/80">
                    {children}
                  </blockquote>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-outside pl-5 mb-3 space-y-1.5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-outside pl-5 mb-3 space-y-1.5">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="leading-relaxed">{children}</li>
                ),
                h1: ({ children }) => (
                  <h1 className="text-xl font-display font-semibold text-foreground mt-4 mb-2">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-lg font-display font-semibold text-foreground mt-4 mb-2">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-display font-semibold text-foreground mt-3 mb-1.5">{children}</h3>
                ),
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-muted/70 text-foreground/90 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-muted/50 text-foreground/85 p-3 rounded-lg text-sm font-mono overflow-x-auto my-3">
                      {children}
                    </code>
                  );
                },
                hr: () => (
                  <hr className="border-border/40 my-4" />
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-primary/60 ml-1 animate-breathe rounded-sm" />
            )}
          </div>
        )}

        {sources && sources.length > 0 && !isStreaming && (
          <div className="mt-4 pt-3 border-t border-border/40">
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-xs text-primary/60 font-body tracking-wider uppercase">
                Sources
              </span>
            </div>
            <div className="space-y-1.5">
              {sources.map((source, i) => (
                <div
                  key={i}
                  className="text-xs text-muted-foreground font-body bg-muted/40 rounded-lg px-3 py-2 border border-border/30"
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
