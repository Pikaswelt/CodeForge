import { useEffect, useState } from 'react';
import type { ReleaseNote } from '../types';

// The changelog always comes from the GitHub release, so it is written once and shown in the update
// window, in "Was ist neu" and after an update.

export function formatReleaseDate(iso: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function useReleaseNotes(version?: string, limit = 5, enabled = true) {
  const [releases, setReleases] = useState<ReleaseNote[]>([]);
  const [current, setCurrent] = useState<ReleaseNote | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const api = window.agentWorkspace?.getReleaseNotes;
        if (!api) {
          if (!cancelled) setError('Die Aenderungen zeigt nur die Desktop-App.');
          return;
        }
        const answer = await api({ version, limit });
        if (cancelled) return;
        setReleases(answer.releases || []);
        setCurrent(answer.current || null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Die Aenderungen konnten nicht geladen werden.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [version, limit, enabled]);

  return { releases, current, loading, error };
}

function renderInline(text: string, keyPrefix: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b${index}`} className="font-semibold text-zinc-100">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-c${index}`} className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10px] text-amber-200/90">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      nodes.push(
        <a key={`${keyPrefix}-a${index}`} href={link?.[2]} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
          {link?.[1]}
        </a>,
      );
    }
    lastIndex = match.index + token.length;
    index += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// Renders the release note as written on GitHub: headings, bullets, bold, code and links.
export function ReleaseBody({ body, compact = false }: { body: string; compact?: boolean }) {
  const lines = body.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key} className={compact ? 'space-y-1' : 'space-y-1.5'}>
        {bullets.map((item, index) => (
          <li key={index} className="flex items-start gap-2 text-[11px] leading-5 text-zinc-400">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-300/60" />
            <span className="min-w-0">{renderInline(item, `${key}-${index}`)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line) {
      flushBullets(`ul-${lineIndex}`);
      return;
    }
    if (line.startsWith('#')) {
      flushBullets(`ul-${lineIndex}`);
      blocks.push(
        <div key={`h-${lineIndex}`} className={`section-label ${blocks.length === 0 ? '' : 'mt-3'}`}>
          {line.replace(/^#+\s*/, '')}
        </div>,
      );
      return;
    }
    const bullet = /^(?:[-*]\s+|(\d+)\.\s+)(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[2]);
      return;
    }
    flushBullets(`ul-${lineIndex}`);
    blocks.push(
      <p key={`p-${lineIndex}`} className="text-[11px] leading-5 text-zinc-400">
        {renderInline(line, `p-${lineIndex}`)}
      </p>,
    );
  });
  flushBullets('ul-final');

  if (blocks.length === 0) return <p className="text-[11px] text-zinc-500">Keine Aenderungen notiert.</p>;
  return <div className="space-y-1.5">{blocks}</div>;
}
