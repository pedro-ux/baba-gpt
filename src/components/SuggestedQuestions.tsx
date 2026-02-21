import { motion } from "framer-motion";

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

const questions = [
  "What does Baba say about the nature of the mind?",
  "How should one practice meditation?",
  "What is the purpose of human life?",
  "What does Baba teach about love and devotion?",
];

const SuggestedQuestions = ({ onSelect }: SuggestedQuestionsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto px-4">
      {questions.map((q, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
          whileHover={{ scale: 1.02, borderColor: "hsl(var(--primary) / 0.4)" }}
          onClick={() => onSelect(q)}
          className="text-left px-4 py-3 rounded-xl border border-border/50 bg-muted/30 text-sm font-body text-foreground/80 hover:bg-muted/60 transition-colors"
        >
          {q}
        </motion.button>
      ))}
    </div>
  );
};

export default SuggestedQuestions;
