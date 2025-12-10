import { useEffect, useMemo, useRef, useState } from 'react';
import { platformRegistry } from '../../platforms/index.js';
import { SessionInfo, SessionData } from '../../platforms/types.js';

export interface SessionDetailData {
  session: SessionInfo;
  title?: string;
  tags?: string[];
  messageCount?: number;
  previewLines: string[];
  fullLines: string[];
}

const PREVIEW_LIMIT = 6; // max messages to show in preview
const PREVIEW_CHARS = 200; // max chars to keep overall
const FULL_PAGE_LINES = 200; // total lines cap (not per page)
const FULL_LINE_TRUNC = 200; // max chars per line

export function useSessionDetail(session: SessionInfo | null) {
  const cacheRef = useRef<Map<string, SessionDetailData>>(new Map());
  const [detail, setDetail] = useState<SessionDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = useMemo(() => session?.filePath || null, [session?.filePath]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session || !cacheKey) {
        setDetail(null);
        setError(null);
        return;
      }

      // cache
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setDetail(cached);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const provider = session.platform
          ? platformRegistry.getProvider(session.platform as any)
          : null;

        if (!provider) {
          throw new Error('Unknown platform for this session');
        }

        const parsed: SessionData = await provider.parseSession(session.filePath);
        const previewLines = buildPreview(parsed);
        const fullLines = buildFullLines(parsed);

        const data: SessionDetailData = {
          session,
          title: parsed.title || session.title,
          tags: parsed.tags,
          messageCount: parsed.messageCount || parsed.messages?.length || parsed.history?.length,
          previewLines,
          fullLines,
        };

        cacheRef.current.set(cacheKey, data);
        if (!cancelled) {
          setDetail(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load session detail');
          setDetail(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, session]);

  return { detail, isLoading, error };
}

function buildPreview(parsed: SessionData): string[] {
  const lines: string[] = [];

  const pushLine = (role: string, content: string) => {
    if (!content) return;
    lines.push(`${role}: ${content}`);
  };

  if (parsed.history && Array.isArray(parsed.history)) {
    const limited = parsed.history.slice(0, PREVIEW_LIMIT);
    for (const turn of limited) {
      const user = Array.isArray(turn) ? turn[0] : (turn as any).user;
      const assistant = Array.isArray(turn) ? turn[1] : (turn as any).assistant;
      if (user?.content) pushLine('user', stringifyContent(user.content));
      if (assistant?.content) pushLine('assistant', stringifyContent(assistant.content));
      if (lines.length >= PREVIEW_LIMIT) break;
    }
  } else if (parsed.messages && Array.isArray(parsed.messages)) {
    for (const msg of parsed.messages.slice(0, PREVIEW_LIMIT)) {
      const role = msg.role || 'message';
      const content = stringifyContent((msg as any).content || (msg as any).text || '');
      pushLine(role, content);
      if (lines.length >= PREVIEW_LIMIT) break;
    }
  }

  // Trim total characters
  let total = 0;
  const trimmed: string[] = [];
  for (const line of lines) {
    if (total >= PREVIEW_CHARS) break;
    const room = PREVIEW_CHARS - total;
    const trimmedLine = line.length > room ? line.slice(0, room - 1) + '…' : line;
    trimmed.push(trimmedLine);
    total += trimmedLine.length;
  }

  return trimmed;
}

function stringifyContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content.find((c: any) => c?.text)?.text;
    if (text) return text;
  }
  if (content?.text) return content.text;
  if (typeof content === 'object') return JSON.stringify(content);
  return '';
}

function buildFullLines(parsed: SessionData): string[] {
  const lines: string[] = [];

  const pushLine = (role: string, content: string) => {
    if (!content) return;
    const truncated = content.length > FULL_LINE_TRUNC ? content.slice(0, FULL_LINE_TRUNC - 1) + '…' : content;
    lines.push(`${role}: ${truncated}`);
  };

  if (parsed.history && Array.isArray(parsed.history)) {
    for (const turn of parsed.history) {
      const user = Array.isArray(turn) ? turn[0] : (turn as any).user;
      const assistant = Array.isArray(turn) ? turn[1] : (turn as any).assistant;
      if (user?.content) pushLine('user', stringifyContent(user.content));
      if (assistant?.content) pushLine('assistant', stringifyContent(assistant.content));
      if (lines.length >= FULL_PAGE_LINES) break;
    }
  } else if (parsed.messages && Array.isArray(parsed.messages)) {
    for (const msg of parsed.messages) {
      const role = msg.role || 'message';
      const content = stringifyContent((msg as any).content || (msg as any).text || '');
      pushLine(role, content);
      if (lines.length >= FULL_PAGE_LINES) break;
    }
  }

  return lines;
}

