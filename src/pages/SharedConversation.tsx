import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";

interface SharedMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; reference: string }[];
  answerType?: "direct" | "inferred";
}

const SharedConversation = () => {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("shared_conversations")
      .select("title, messages")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError(true);
        } else {
          setTitle(data.title);
          setMessages(data.messages as unknown as SharedMessage[]);
        }
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.img
          src={logo}
          alt="Loading"
          className="w-16 h-16 rounded-full"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-body">Conversation not found</p>
        <Link to="/" className="text-primary font-body text-sm hover:underline">
          Go to Baba GPT
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 py-4 px-4 border-b border-border/30">
        <Link to="/" className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <img src={logo} alt="Baba GPT" className="w-8 h-8 rounded-full object-cover" />
        <div>
          <h1 className="text-base font-display font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground font-body">Shared conversation</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg, i) => (
            <ChatMessage key={i} {...msg} />
          ))}
        </div>
      </main>
    </div>
  );
};

export default SharedConversation;
