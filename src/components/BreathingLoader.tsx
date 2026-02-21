import { motion } from "framer-motion";
import logo from "@/assets/logo.png";

const BreathingLoader = () => (
  <div className="flex items-center gap-2 px-1 py-3">
    <div className="flex items-center gap-2">
      <img src={logo} alt="Baba" className="w-6 h-6 rounded-full object-cover" />
      <span className="text-xs text-muted-foreground font-body tracking-wide uppercase">
        Baba
      </span>
    </div>
    <div className="flex gap-1 ml-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/50"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.3,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  </div>
);

export default BreathingLoader;
