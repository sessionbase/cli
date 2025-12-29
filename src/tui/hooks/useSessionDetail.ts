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
type NormalizedLine = { role: string; text: string };

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
        const normalized = normalizeLines(parsed, session.platform);
        const previewLines = buildPreviewFromLines(normalized);
        const fullLines = buildFullLinesFromLines(normalized);

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

function buildPreviewFromLines(lines: NormalizedLine[]): string[] {
  const limited = lines.slice(0, PREVIEW_LIMIT);
  let total = 0;
  const trimmed: string[] = [];
  for (const ln of limited) {
    const line = `${ln.role}: ${ln.text}`;
    if (total >= PREVIEW_CHARS) break;
    const room = PREVIEW_CHARS - total;
    const trimmedLine = line.length > room ? line.slice(0, room - 1) + '…' : line;
    trimmed.push(trimmedLine);
    total += trimmedLine.length;
  }
  return trimmed;
}

function buildFullLinesFromLines(lines: NormalizedLine[]): string[] {
  const out: string[] = [];
  for (const ln of lines) {
    if (out.length >= FULL_PAGE_LINES) break;
    const content = ln.text.length > FULL_LINE_TRUNC ? ln.text.slice(0, FULL_LINE_TRUNC - 1) + '…' : ln.text;
    out.push(`${ln.role}: ${content}`);
  }
  return out;
}

function normalizeLines(parsed: SessionData, platform?: string): NormalizedLine[] {
  if (platform === 'codex') return normalizeCodex(parsed);
  if (platform === 'claude-code') return normalizeClaude(parsed);
  if (platform === 'gemini-cli') return normalizeGemini(parsed);
  if (platform === 'qchat') return normalizeQChat(parsed);
  // fallback generic
  const lines: NormalizedLine[] = [];
  if (parsed.history && Array.isArray(parsed.history)) {
    for (const turn of parsed.history) {
      const user = Array.isArray(turn) ? turn[0] : (turn as any).user;
      const assistant = Array.isArray(turn) ? turn[1] : (turn as any).assistant;
      if (user?.content) lines.push({ role: 'user', text: stringifyContent(user.content) });
      if (assistant?.content) lines.push({ role: 'assistant', text: stringifyContent(assistant.content) });
      if (lines.length >= FULL_PAGE_LINES) break;
    }
  } else if (parsed.messages && Array.isArray(parsed.messages)) {
    for (const msg of parsed.messages) {
      const role = (msg as any).role || 'message';
      const content = stringifyContent((msg as any).content || (msg as any).text || '');
      lines.push({ role, text: content });
      if (lines.length >= FULL_PAGE_LINES) break;
    }
  }
  return lines;
}

function normalizeCodex(parsed: SessionData): NormalizedLine[] {
  const lines: NormalizedLine[] = [];
  const records = parsed.messages || [];
  for (const rec of records) {
    if (rec && typeof rec === 'object') {
      if ((rec as any).type === 'response_item' && (rec as any).payload?.type === 'message') {
        const contentArr = (rec as any).payload?.content || [];
        const text = extractInputText(contentArr);
        if (text) lines.push({ role: (rec as any).payload?.role || 'message', text });
      } else if ((rec as any).type === 'message' && Array.isArray((rec as any).content)) {
        const text = extractInputText((rec as any).content);
        if (text) lines.push({ role: (rec as any).role || 'message', text });
      }
    }
    if (lines.length >= FULL_PAGE_LINES) break;
  }
  return lines;
}

function normalizeClaude(parsed: SessionData): NormalizedLine[] {
  const lines: NormalizedLine[] = [];
  const records = parsed.messages || [];
  for (const rec of records) {
    const msg = (rec as any).message || rec;
    const role = msg?.role || (msg?.author && msg.author.role) || 'message';
    const content = msg?.content;
    if (content) {
      const text = stringifyContent(content);
      if (text) lines.push({ role, text });
    }
    if (lines.length >= FULL_PAGE_LINES) break;
  }
  return lines;
}

function normalizeGemini(parsed: SessionData): NormalizedLine[] {
  const lines: NormalizedLine[] = [];
  const msgs = parsed.messages || [];
  for (const msg of msgs) {
    const role = (msg as any).role || 'message';
    const parts = (msg as any).parts;
    if (Array.isArray(parts)) {
      const textPart = parts.find((p: any) => p?.text)?.text;
      if (textPart) lines.push({ role, text: textPart });
    }
    if (lines.length >= FULL_PAGE_LINES) break;
  }
  return lines;
}

function normalizeQChat(parsed: SessionData): NormalizedLine[] {
  const lines: NormalizedLine[] = [];
  const history = parsed.history || [];
  for (const turn of history) {
    const user = Array.isArray(turn) ? turn[0] : (turn as any).user;
    const assistant = Array.isArray(turn) ? turn[1] : (turn as any).assistant;
    if (user?.content?.Prompt?.prompt) lines.push({ role: 'user', text: user.content.Prompt.prompt });
    if (assistant?.content?.completion) lines.push({ role: 'assistant', text: assistant.content.completion });
    if (lines.length >= FULL_PAGE_LINES) break;
  }
  return lines;
}

function stringifyContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textArr = content.map((c: any) => c?.text || '').filter(Boolean);
    if (textArr.length) return textArr.join(' ');
    const inputText = content.find((c: any) => c?.type === 'input_text' && c?.text)?.text;
    if (inputText) return inputText;
    const plain = content.find((c: any) => typeof c === 'string');
    if (plain) return plain as string;
  }
  if (content?.text) return content.text;
  if (typeof content === 'object') return JSON.stringify(content);
  return '';
}

function extractInputText(contentArr: any[]): string {
  if (!Array.isArray(contentArr)) return '';
  const texts: string[] = [];
  for (const c of contentArr) {
    if (c?.type === 'input_text' && c?.text) {
      texts.push(c.text);
    } else if (typeof c === 'string') {
      texts.push(c);
    } else if (c?.text) {
      texts.push(c.text);
    }
  }
  return texts.join(' ').trim();
}

