import { useEffect, useState } from 'react';

// Phones and tablets (below the lg breakpoint) get the touch-friendly layout.
const QUERY = '(max-width: 1023px)';

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
