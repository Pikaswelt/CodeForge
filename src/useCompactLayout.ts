import { useEffect, useState } from 'react';

// Phones and tablets get the touch-friendly layout: narrow screens, and touch screens
// without a mouse (tablets in landscape are wider than the lg breakpoint).
const QUERY = '(max-width: 1023px), (pointer: coarse) and (hover: none)';

export function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia?.(QUERY).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(QUERY);
    if (!media) return;
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
