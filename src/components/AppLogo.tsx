import { motion } from 'motion/react';

export default function AppLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <motion.svg
      whileHover={{ scale: 1.05, rotate: 3 }}
      whileTap={{ scale: 0.95 }}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="fancycode-mark" x1="6" x2="58" y1="4" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff5fb8" />
          <stop offset="0.5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.5" fill="url(#fancycode-mark)" />
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        d="M23.5 20.5 12 32l11.5 11.5M40.5 20.5 52 32 40.5 43.5"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <motion.path
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'backOut', delay: 0.5 }}
        style={{ transformOrigin: '32px 32px' }}
        d="M32 22c1 6.5 3 8.5 9.5 10-6.5 1.5-8.5 3.5-9.5 10-1-6.5-3-8.5-9.5-10 6.5-1.5 8.5-3.5 9.5-10Z"
        fill="#fff"
      />
      <motion.path
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.9 }}
        transition={{ duration: 0.4, ease: 'backOut', delay: 0.8 }}
        style={{ transformOrigin: '47.5px 14px' }}
        d="M47.5 10c.5 2.75 1.25 3.5 4 4-2.75.5-3.5 1.25-4 4-.5-2.75-1.25-3.5-4-4 2.75-.5 3.5-1.25 4-4Z"
        fill="#fff"
      />
    </motion.svg>
  );
}
