import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, Loader2, Plus, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ChatMessage, ChatMessageData } from '@/components/ai-command/ChatMessage';
import { ExampleCommands } from '@/components/ai-command/ExampleCommands';
import { VoiceInput } from '@/components/ai-command/VoiceInput';

interface CommandResult {
  success: boolean;
  message: string;
  recordType?: string;
  recordId?: string;
  data?: any;
  error?: string;
  isQuestion?: boolean;
  isReport?: boolean;
  imageUrl?: string | null;
}

const AICommandBar: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!input.trim() || isLoading) return;
    if (!user?.id) {
      toast({
        title: "Not authenticated",
        description: "Please log in to use the command bar.",
        variant: "destructive"
      });
      return;
    }

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-command', {
        body: { prompt: input.trim(), userId: user.id }
      });

      if (error) throw error;

      const commandResult = data as CommandResult;

      // Expand to chat mode if it's a question or conversation
      if (commandResult.isQuestion || commandResult.isReport || messages.length > 0) {
        setIsChatMode(true);
      }

      const assistantMessage: ChatMessageData = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: commandResult.message,
        timestamp: new Date(),
        recordType: commandResult.recordType,
        recordId: commandResult.recordId,
        success: commandResult.success,
        imageUrl: commandResult.imageUrl || null
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (commandResult.success && commandResult.recordType) {
        // Invalidate relevant queries
        const queryMap: Record<string, string[]> = {
          invoice: ['invoices', 'dashboard-stats'],
          client: ['clients'],
          journal: ['journals'],
          quotation: ['quotations'],
          vendor: ['vendors'],
          sales_order: ['sales-orders'],
          purchase_order: ['purchase-orders'],
          inventory: ['inventory']
        };

        const queries = queryMap[commandResult.recordType] || [];
        queries.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));

        if (!commandResult.isQuestion && !commandResult.isReport) {
          toast({
            title: "Success!",
            description: commandResult.message,
          });
        }
      }
    } catch (err) {
      console.error('AI Command error:', err);
      const errorMessage: ChatMessageData = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Failed to process command. Please try again.',
        timestamp: new Date(),
        success: false
      };
      setMessages(prev => [...prev, errorMessage]);
      toast({
        title: "Error",
        description: "Failed to process your command.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setInput(example);
    inputRef.current?.focus();
  };

  const handleVoiceTranscript = (text: string) => {
    setInput(text);
    // Auto-submit after voice input
    setTimeout(() => {
      const form = document.getElementById('ai-command-form') as HTMLFormElement;
      if (form) form.requestSubmit();
    }, 100);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    handleMinimize();
  };

  const handleNewChat = () => {
    setMessages([]);
    setIsChatMode(false);
    setInput('');
    inputRef.current?.focus();
  };

  const handleMinimize = () => {
    setIsExpanded(false);
    setIsChatMode(false);
  };

  const handleClose = () => {
    setIsExpanded(false);
    setIsChatMode(false);
    setMessages([]);
    setInput('');
  };

  // Collapsed pill button
  if (!isExpanded) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 md:bottom-6">
        <Button
          onClick={() => setIsExpanded(true)}
          className="h-12 px-6 rounded-full bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-300 gap-2 text-white border-0"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Ask AI to create invoice, client, or ask questions…</span>
          <span className="sm:hidden">AI Command</span>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl md:bottom-6",
      "transition-all duration-300 ease-out"
    )}>
      <div className={cn(
        "bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden",
        "transition-all duration-300 ease-out",
        isChatMode ? "h-[500px]" : "h-auto"
      )}>
        {/* Header - Only show in chat mode */}
        {isChatMode && (
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-500 to-blue-600 text-white">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">AI Assistant</h3>
                <p className="text-[10px] text-white/70">Ask anything about your business</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewChat}
                className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleMinimize}
                className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                title="Minimize"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Chat Content */}
        <div className={cn(
          "flex flex-col",
          isChatMode ? "h-[calc(500px-120px)]" : "max-h-[400px]"
        )}>
          {messages.length === 0 && !isChatMode ? (
            <ExampleCommands onSelect={handleExampleClick} disabled={isLoading} />
          ) : (
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onNavigate={handleNavigate}
                  />
                ))}
                {isLoading && (
                  <div className="flex gap-3 justify-start animate-in fade-in-0">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-500 to-blue-600 flex items-center justify-center shrink-0">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-muted/80 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Input Area */}
        <form id="ai-command-form" onSubmit={handleSubmit} className="flex items-center gap-2 p-3 border-t border-border/50 bg-background/50">
          <VoiceInput onTranscript={handleVoiceTranscript} disabled={isLoading} />
          
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isChatMode ? "Ask a follow-up question..." : "Ask AI to create invoice, client, or ask questions…"}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/60"
            disabled={isLoading}
          />
          
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || isLoading}
            className={cn(
              "h-9 w-9 p-0 shrink-0 rounded-full",
              "bg-gradient-to-r from-orange-500 to-blue-600",
              "hover:from-orange-600 hover:to-blue-700",
              "disabled:opacity-50"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Send className="h-4 w-4 text-white" />
            )}
          </Button>
          
          {!isChatMode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-9 w-9 p-0 shrink-0 rounded-full hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
};

export default AICommandBar;
