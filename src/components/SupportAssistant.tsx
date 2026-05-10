import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HelpCircle,
  Send,
  Loader2,
  Paperclip,
  X,
  Sparkles,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Bot,
  User as UserIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  ACZEN_DOCS_URL,
  askSupportAssistant,
  fileToSupportAttachment,
  loadAczenDocs,
  type SupportAttachment,
  type SupportTurn,
} from '@/services/supportAssistantService';

const OPEN_EVENT = 'aczen:open-support-assistant';
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB per file
const MAX_FILES = 4;
const ACCEPTED_TYPES =
  'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,application/json';

export const openSupportAssistant = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  }
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: { name: string; mimeType: string; size: number }[];
  sources?: string[];
  timestamp: number;
  error?: boolean;
}

const SUGGESTIONS = [
  'How do I create my first invoice?',
  'Walk me through enabling Razorpay payouts.',
  'What does the KYC verification flow look like?',
  'Show me how to import a bank statement.',
];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const renderMarkdownLite = (text: string) => {
  // Lightweight Markdown: preserve newlines, bold, inline code, and auto-link http(s).
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const linkified = escape(text)
    .replace(
      /(https?:\/\/[^\s<]+[^\s<.,;:!?])/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline text-primary hover:opacity-80">$1</a>',
    )
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[0.8em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return linkified;
};

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

interface SupportAssistantTriggerProps {
  className?: string;
  variant?: 'icon' | 'pill';
  label?: string;
}

export const SupportAssistantTrigger: React.FC<SupportAssistantTriggerProps> = ({
  className,
  variant = 'icon',
  label = 'Support',
}) => {
  if (variant === 'pill') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={openSupportAssistant}
        className={cn('h-9 gap-2 rounded-full', className)}
        aria-label="Open support assistant"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <span>{label}</span>
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={openSupportAssistant}
      className={cn(
        'h-11 w-11 rounded-full border border-primary/15 bg-background/70',
        className,
      )}
      aria-label="Open support assistant"
      title="Support"
    >
      <HelpCircle className="h-4 w-4" />
    </Button>
  );
};

const SupportAssistant: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [docsReady, setDocsReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  // Warm up the docs once the panel is opened so the first answer is fast.
  useEffect(() => {
    if (!open || docsReady) return;
    let cancelled = false;
    loadAczenDocs()
      .then((d) => {
        if (!cancelled) setDocsReady(Boolean(d.text));
      })
      .catch(() => {
        if (!cancelled) setDocsReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, docsReady]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const history: SupportTurn[] = useMemo(
    () =>
      messages
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, text: m.content })),
    [messages],
  );

  const handlePickFiles = () => fileInputRef.current?.click();

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const accepted: File[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        toast({
          title: 'File too large',
          description: `${f.name} is ${formatBytes(f.size)}. Max 15 MB per file.`,
          variant: 'destructive',
        });
        continue;
      }
      accepted.push(f);
    }

    setPendingFiles((prev) => {
      const combined = [...prev, ...accepted].slice(0, MAX_FILES);
      if (combined.length < prev.length + accepted.length) {
        toast({
          title: 'Attachment limit reached',
          description: `You can attach up to ${MAX_FILES} files per message.`,
        });
      }
      return combined;
    });

    e.target.value = '';
  };

  const removeFile = (idx: number) =>
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text && pendingFiles.length === 0) return;
      if (loading) return;

      const filesForTurn = pendingFiles.slice();
      setPendingFiles([]);
      setInput('');

      let attachments: SupportAttachment[] = [];
      try {
        attachments = await Promise.all(filesForTurn.map(fileToSupportAttachment));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: 'Could not read attachment',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      const userMessage: ChatMessage = {
        id: newId(),
        role: 'user',
        content:
          text ||
          (filesForTurn.length > 0
            ? `Attached ${filesForTurn.length} file${filesForTurn.length > 1 ? 's' : ''}.`
            : ''),
        attachments: filesForTurn.map((f) => ({
          name: f.name,
          mimeType: f.type,
          size: f.size,
        })),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      try {
        const result = await askSupportAssistant({
          question: text,
          history,
          attachments,
          signal: controller.signal,
        });

        const assistantMessage: ChatMessage = {
          id: newId(),
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message =
          err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        const errorMessage: ChatMessage = {
          id: newId(),
          role: 'assistant',
          content: message,
          timestamp: Date.now(),
          error: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
        toast({
          title: 'Support assistant error',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [history, input, loading, pendingFiles, toast],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    const fakeEvent = {
      target: { files, value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    onFilesSelected(fakeEvent);
  };

  const resetConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setPendingFiles([]);
    setInput('');
    setLoading(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col border-l border-border bg-background"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <SheetHeader className="flex flex-row items-center gap-3 border-b border-border bg-background px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-base font-semibold">Aczen Support</SheetTitle>
            <p className="text-xs text-muted-foreground truncate">
              {docsReady
                ? 'Grounded in the live Aczen docs · powered by Gemini'
                : 'Loading the latest docs…'}
            </p>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={resetConversation}
            >
              Reset
            </Button>
          )}
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <EmptyState onPick={(q) => sendMessage(q)} disabled={loading} />
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {loading && <TypingBubble />}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-background px-4 py-3 space-y-2">
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((f, idx) => (
                <AttachmentChip
                  key={`${f.name}-${idx}`}
                  name={f.name}
                  mimeType={f.type}
                  size={f.size}
                  onRemove={() => removeFile(idx)}
                />
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={onFilesSelected}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handlePickFiles}
              disabled={loading || pendingFiles.length >= MAX_FILES}
              aria-label="Attach files"
              className="h-10 w-10 shrink-0 rounded-full"
              title="Attach files (images, PDFs, CSVs)"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything about Aczen — or drop a file"
              className="min-h-[44px] max-h-40 resize-none text-sm"
              disabled={loading}
            />
            <Button
              type="button"
              size="icon"
              onClick={() => sendMessage()}
              disabled={loading || (!input.trim() && pendingFiles.length === 0)}
              className="h-10 w-10 shrink-0 rounded-full"
              aria-label="Send message"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            Answers are AI-generated from{' '}
            <a
              href={ACZEN_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              the Aczen docs
            </a>
            . Verify critical actions before applying.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const EmptyState: React.FC<{ onPick: (q: string) => void; disabled: boolean }> = ({
  onPick,
  disabled,
}) => (
  <div className="flex flex-col items-center justify-center text-center py-8 gap-5">
    <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
      <Bot className="h-7 w-7" />
    </div>
    <div className="space-y-1">
      <h3 className="text-base font-semibold">How can I help?</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        I read the Aczen docs in real time and can review screenshots, PDFs, or bank
        statements you attach.
      </p>
    </div>
    <div className="grid grid-cols-1 gap-2 w-full">
      {SUGGESTIONS.map((s) => (
        <Button
          key={s}
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onPick(s)}
          className="justify-start h-auto py-2 px-3 text-left whitespace-normal text-xs"
        >
          {s}
        </Button>
      ))}
    </div>
  </div>
);

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <Avatar className="h-7 w-7 bg-primary shrink-0">
          <AvatarFallback className="bg-primary text-white">
            <Sparkles className="h-3 w-3" />
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          'rounded-2xl px-3.5 py-2.5 max-w-[85%] text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : message.error
              ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm'
              : 'bg-muted rounded-tl-sm',
        )}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn('flex flex-wrap gap-1.5 mb-2')}>
            {message.attachments.map((a, i) => (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]',
                  isUser ? 'bg-primary-foreground/15' : 'bg-background',
                )}
              >
                {a.mimeType.startsWith('image/') ? (
                  <ImageIcon className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                <span className="max-w-[140px] truncate">{a.name}</span>
                <span className="opacity-70">{formatBytes(a.size)}</span>
              </span>
            ))}
          </div>
        )}

        <div
          className="whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: renderMarkdownLite(message.content) }}
        />

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-current/10 space-y-1">
            <div className="text-[10px] uppercase tracking-wide opacity-60">Sources</div>
            {message.sources.slice(0, 4).map((s) => (
              <a
                key={s}
                href={s}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs underline opacity-80 hover:opacity-100 break-all"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{s.replace(/^https?:\/\//, '')}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <Avatar className="h-7 w-7 bg-secondary shrink-0">
          <AvatarFallback>
            <UserIcon className="h-3 w-3" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

const TypingBubble: React.FC = () => (
  <div className="flex gap-2 justify-start">
    <Avatar className="h-7 w-7 bg-primary shrink-0">
      <AvatarFallback className="bg-primary text-white">
        <Sparkles className="h-3 w-3" />
      </AvatarFallback>
    </Avatar>
    <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-muted shadow-sm">
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse [animation-delay:240ms]" />
      </div>
    </div>
  </div>
);

const AttachmentChip: React.FC<{
  name: string;
  mimeType: string;
  size: number;
  onRemove: () => void;
}> = ({ name, mimeType, size, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px]">
    {mimeType.startsWith('image/') ? (
      <ImageIcon className="h-3 w-3" />
    ) : (
      <FileText className="h-3 w-3" />
    )}
    <span className="max-w-[140px] truncate">{name}</span>
    <span className="text-muted-foreground">{formatBytes(size)}</span>
    <button
      type="button"
      onClick={onRemove}
      className="ml-1 rounded-full p-0.5 hover:bg-background"
      aria-label={`Remove ${name}`}
    >
      <X className="h-3 w-3" />
    </button>
  </span>
);

export default SupportAssistant;
