import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, Loader2, FileText, Users, BookOpen, FileCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface CommandResult {
  success: boolean;
  message: string;
  recordType?: string;
  recordId?: string;
  data?: any;
  error?: string;
}

const EXAMPLE_COMMANDS = [
  "Create an invoice for ABC Traders for ₹25,000 with GST",
  "Add a client named Ramesh Enterprises from Hyderabad",
  "Record a journal entry for rent paid ₹10,000 via bank",
  "Create a quotation for 50 units at ₹500 each"
];

const AICommandBar: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

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

    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-command', {
        body: { prompt: input.trim(), userId: user.id }
      });

      if (error) throw error;

      const commandResult = data as CommandResult;
      setResult(commandResult);

      if (commandResult.success) {
        // Invalidate relevant queries to refresh data
        if (commandResult.recordType === 'invoice') {
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        } else if (commandResult.recordType === 'client') {
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        } else if (commandResult.recordType === 'journal') {
          queryClient.invalidateQueries({ queryKey: ['journals'] });
        } else if (commandResult.recordType === 'quotation') {
          queryClient.invalidateQueries({ queryKey: ['quotations'] });
        }

        toast({
          title: "Success!",
          description: commandResult.message,
        });

        setInput('');
      }
    } catch (err) {
      console.error('AI Command error:', err);
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to process command'
      });
      toast({
        title: "Error",
        description: "Failed to process your command. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setInput(example);
    setShowExamples(false);
    inputRef.current?.focus();
  };

  const getRecordIcon = (type?: string) => {
    switch (type) {
      case 'invoice': return <FileText className="h-4 w-4" />;
      case 'client': return <Users className="h-4 w-4" />;
      case 'journal': return <BookOpen className="h-4 w-4" />;
      case 'quotation': return <FileCheck className="h-4 w-4" />;
      default: return null;
    }
  };

  const getRecordPath = (type?: string) => {
    switch (type) {
      case 'invoice': return '/invoices';
      case 'client': return '/clients';
      case 'journal': return '/accounting/manual-journals';
      case 'quotation': return '/quotations';
      default: return null;
    }
  };

  const handleViewRecord = () => {
    if (result?.recordType) {
      const path = getRecordPath(result.recordType);
      if (path) {
        navigate(path);
        setIsExpanded(false);
        setResult(null);
      }
    }
  };

  if (!isExpanded) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 md:bottom-6">
        <Button
          onClick={() => setIsExpanded(true)}
          className="h-12 px-6 rounded-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-300 gap-2"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Ask AI to create invoice, client, journal…</span>
          <span className="sm:hidden">AI Command</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl md:bottom-6">
      <div className="bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Result Display */}
        {result && (
          <div className={cn(
            "px-4 py-3 border-b border-border",
            result.success ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"
          )}>
            <div className="flex items-start gap-3">
              {result.recordType && (
                <div className={cn(
                  "p-2 rounded-lg",
                  result.success ? "bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400"
                )}>
                  {getRecordIcon(result.recordType)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm whitespace-pre-line",
                  result.success ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"
                )}>
                  {result.message}
                </p>
                {result.success && result.recordType && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleViewRecord}
                    className="mt-2 h-7 px-2 text-xs gap-1"
                  >
                    View {result.recordType}
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResult(null)}
                className="h-6 w-6 p-0 shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Examples Dropdown */}
        {showExamples && (
          <div className="px-4 py-3 border-b border-border bg-muted/50">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Try these examples:</p>
            <div className="space-y-1">
              {EXAMPLE_COMMANDS.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => handleExampleClick(example)}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-accent transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowExamples(!showExamples)}
            className="h-8 w-8 p-0 shrink-0"
          >
            <Sparkles className="h-4 w-4 text-primary" />
          </Button>
          
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI to create invoice, client, journal…"
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
            disabled={isLoading}
          />
          
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || isLoading}
            className="h-8 w-8 p-0 shrink-0 rounded-full"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
          
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsExpanded(false);
              setResult(null);
              setInput('');
              setShowExamples(false);
            }}
            className="h-8 w-8 p-0 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AICommandBar;
