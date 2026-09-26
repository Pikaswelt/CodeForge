import { Bot, Brain, Code2, Cpu, Rocket, Sparkles, Terminal, Wand2, Zap, type LucideIcon } from 'lucide-react';

export const HARNESS_ICONS: Record<string, LucideIcon> = {
  Terminal,
  Sparkles,
  Code2,
  Rocket,
  Bot,
  Brain,
  Cpu,
  Zap,
  Wand2,
};

export const harnessIcon = (name?: string): LucideIcon => HARNESS_ICONS[name || ''] || Terminal;
