import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/ClerkAuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { usePerformanceData } from '@/hooks/usePerformanceData';
import VoiceInput from '@/components/ai-command/VoiceInput';
import ExampleCommands from '@/components/ai-command/ExampleCommands';
import ChatMessage, { type ChatMessageData } from '@/components/ai-command/ChatMessage';

const CREATE_INVOICE_RE = /\b(create|make|add|generate)\b.*\binvoice\b/i;
const CREATE_CLIENT_RE = /\b(create|make|add)\b.*\b(client|customer)\b/i;
const CREATE_VENDOR_RE = /\b(create|make|add)\b.*\b(vendor|supplier)\b/i;

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeResponseText = (content: string) =>
  (content || '')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/\r\n/g, '\n')
    .trim();

const tryExtractAmount = (text: string): number => {
  const lakh = text.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l)\b/i);
  if (lakh) return Math.round(Number(lakh[1]) * 100000);

  const k = text.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (k) return Math.round(Number(k[1]) * 1000);

  const money = text.match(/(?:inr|rs\.?|rupees?)\s*([\d,]+(?:\.\d+)?)/i) || text.match(/\b(\d[\d,]*(?:\.\d+)?)\b/);
  if (!money) return 0;
  return Number(money[1].replace(/,/g, '')) || 0;
};

const tryExtractGSTRate = (text: string): number => {
  const match = text.match(/(\d{1,2})\s*%?\s*gst/i);
  if (!match) return 18;
  const value = Number(match[1]);
  return [0, 3, 5, 12, 18, 28].includes(value) ? value : 18;
};

const tryExtractName = (text: string, fallback: string): string => {
  const patterns = [
    /for\s+([a-zA-Z0-9&.,\-\s]+?)(?:\s+(?:for|with|amount|inr|rs\.|gst)\b|$)/i,
    /named\s+([a-zA-Z0-9&.,\-\s]+?)(?:\s+(?:from|with|at|email|phone)\b|$)/i,
    /(client|customer|vendor|supplier)\s+([a-zA-Z0-9&.,\-\s]+?)(?:\s+(?:from|with|at|email|phone)\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const raw = (match[2] || match[1] || '').trim();
    if (raw) return raw.replace(/\s{2,}/g, ' ');
  }
  return fallback;
};

const tryExtractEmail = (text: string): string | null => {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
};

const tryExtractPhone = (text: string): string | null => {
  const match = text.match(/(\+91[\s-]?)?[6-9]\d{9}/);
  return match ? match[0].replace(/\s+/g, '') : null;
};

const tryExtractGSTNumber = (text: string): string | null => {
  const match = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Zz][A-Z0-9]\b/);
  return match ? match[0].toUpperCase() : null;
};

const AICommandBar: React.FC = () => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);

  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const performanceData = usePerformanceData();

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  const addUserMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: 'user',
        content,
        timestamp: new Date(),
      },
    ]);
  };

  const addAssistantMessage = (payload: {
    content: string;
    recordType?: string | null;
    recordId?: string | null;
    success?: boolean;
    imageUrl?: string | null;
  }) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: 'assistant',
        content: normalizeResponseText(payload.content),
        timestamp: new Date(),
        recordType: payload.recordType || undefined,
        recordId: payload.recordId || undefined,
        success: payload.success,
        imageUrl: payload.imageUrl || null,
      },
    ]);
  };

  const handleLocalCreate = async (prompt: string) => {
    if (!user?.id) return { handled: false };

    if (CREATE_INVOICE_RE.test(prompt)) {
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const today = new Date();
      const due = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const invoiceNumber = `INV-${today.getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
      const amount = tryExtractAmount(prompt);
      const gstRate = tryExtractGSTRate(prompt);
      const gstAmount = Math.round((amount * gstRate) / 100);
      const totalAmount = amount + gstAmount;

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          user_id: user.id,
          invoice_number: invoiceNumber,
          client_name: tryExtractName(prompt, 'Unknown Client'),
          client_email: tryExtractEmail(prompt),
          client_gst_number: tryExtractGSTNumber(prompt),
          amount,
          gst_rate: gstRate,
          gst_amount: gstAmount,
          total_amount: totalAmount,
          invoice_date: today.toISOString().split('T')[0],
          due_date: due.toISOString().split('T')[0],
          status: 'pending',
          items: [],
        })
        .select()
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      return {
        handled: true,
        recordType: 'invoice',
        recordId: data.id,
        message: `**Invoice created successfully**\n- Invoice No: ${data.invoice_number}\n- Client: ${data.client_name}\n- Total: INR ${Number(data.total_amount || 0).toLocaleString('en-IN')}`,
      };
    }

    if (CREATE_CLIENT_RE.test(prompt)) {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          user_id: user.id,
          name: tryExtractName(prompt, 'New Client'),
          email: tryExtractEmail(prompt),
          phone: tryExtractPhone(prompt),
          gst_number: tryExtractGSTNumber(prompt),
        })
        .select()
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      return {
        handled: true,
        recordType: 'client',
        recordId: data.id,
        message: `**Client created successfully**\n- Name: ${data.name}\n- Email: ${data.email || 'Not provided'}\n- Phone: ${data.phone || 'Not provided'}`,
      };
    }

    if (CREATE_VENDOR_RE.test(prompt)) {
      const { data, error } = await supabase
        .from('vendors')
        .insert({
          user_id: user.id,
          name: tryExtractName(prompt, 'New Vendor'),
          email: tryExtractEmail(prompt),
          phone: tryExtractPhone(prompt),
          gst_number: tryExtractGSTNumber(prompt),
        })
        .select()
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      return {
        handled: true,
        recordType: 'vendor',
        recordId: data.id,
        message: `**Vendor created successfully**\n- Name: ${data.name}\n- Email: ${data.email || 'Not provided'}\n- Phone: ${data.phone || 'Not provided'}`,
      };
    }

    return { handled: false };
  };

  const runCommand = async (promptText: string) => {
    const prompt = promptText.trim();
    if (!prompt || isLoading) return;
    if (!user?.id) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to use AI command.',
        variant: 'destructive',
      });
      return;
    }

    addUserMessage(prompt);
    setInput('');
    setIsOpen(true);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-command', {
        body: { prompt, userId: user.id },
      });
      if (error) throw error;

      addAssistantMessage({
        content: data?.message || 'Command processed.',
        recordType: data?.recordType,
        recordId: data?.recordId,
        success: data?.success !== false,
        imageUrl: data?.imageUrl || null,
      });
    } catch (err: any) {
      try {
        const localResult = await handleLocalCreate(prompt);
        if (localResult.handled) {
          addAssistantMessage({
            content: localResult.message,
            recordType: localResult.recordType,
            recordId: localResult.recordId,
            success: true,
          });
          return;
        }

        const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('financial-advisor', {
          body: {
            question: prompt,
            dataContext: performanceData,
          },
        });
        if (fallbackError) throw fallbackError;

        const shouldGenerateImage =
          !/(create|add|make|generate)\b/i.test(prompt) &&
          /(gst|tax|tds|report|p&l|profit|loss|cash flow|analysis|explain|what|how|why|\?)/i.test(prompt);

        addAssistantMessage({
          content: fallbackData?.response || 'Command processed.',
          recordType: 'answer',
          success: true,
          imageUrl: shouldGenerateImage
            ? `https://image.pollinations.ai/prompt/${encodeURIComponent(`Professional finance infographic about: ${prompt}`)}`
            : null,
        });
      } catch (fallbackErr: any) {
        const errorText = fallbackErr?.message || err?.message || 'Failed to process AI command.';
        addAssistantMessage({ content: errorText, success: false });
        toast({
          title: 'AI command failed',
          description: errorText,
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCommand(input);
  };

  return (
    <div className="fixed left-0 right-0 bottom-16 md:bottom-3 z-[90] pointer-events-none">
      <div className="max-w-5xl mx-auto px-2 md:px-4 pointer-events-auto">
        <div
          className={cn(
            'mb-2 overflow-hidden rounded-2xl border bg-background/95 backdrop-blur shadow-2xl transition-all',
            isOpen ? 'max-h-[60vh]' : 'max-h-0 border-transparent shadow-none'
          )}
        >
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">AI Command Output</div>
          <ScrollArea className="h-[42vh] p-3">
            <div className="space-y-3">
              {!hasMessages && <ExampleCommands onSelect={(text) => void runCommand(text)} disabled={isLoading} />}
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} onNavigate={navigate} />
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-orange-500 to-blue-600 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-muted/80 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-2xl border bg-background/95 px-2 py-2 shadow-xl backdrop-blur"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
            onClick={() => setIsOpen((prev) => !prev)}
            title={isOpen ? 'Collapse AI command panel' : 'Expand AI command panel'}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-blue-600 shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask or command: Create invoice for ABC INR 25000 with GST"
            disabled={isLoading}
            className="border-0 bg-transparent focus-visible:ring-0"
          />

          <VoiceInput onTranscript={(text) => setInput(text)} disabled={isLoading} />

          <Button type="submit" size="sm" disabled={isLoading || !input.trim()} className="shrink-0">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AICommandBar;
