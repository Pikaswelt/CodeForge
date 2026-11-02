import { motion } from 'motion/react';
import { logoSvg } from '../vendor/fancyservers-collab/collab.js';

// Fc-Kachel im gemeinsamen FancyServers-Stil (wie FancyAgent „Fa“ und Kuroi Studio „Ks“).
const FC_LOGO = logoSvg('fancycode', 64).replace('<svg ', '<svg width="100%" height="100%" ');

export default function AppLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <motion.span
      whileHover={{ scale: 1.05, rotate: 3 }}
      whileTap={{ scale: 0.95 }}
      aria-hidden="true"
      className={`inline-block ${className}`}
      // Festes, eigenes SVG aus dem Collab-Paket (kein Nutzertext).
      dangerouslySetInnerHTML={{ __html: FC_LOGO }}
    />
  );
}
