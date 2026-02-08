import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Loader2, User, X, Minimize2, Lightbulb, Sparkles, FileText, FileCheck, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { usePerformanceData } from '@/hooks/usePerformanceData';
import { cn } from '@/lib/utils';

interface ActionLink {
  label: string;
  path: string;
  icon: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actionLink?: ActionLink | null;
}

const suggestedQuestions = [
  "Show me my last month's Profit & Loss",
  "What is my current cash flow status?",
  "Analyze my top expenses",
  "How much revenue did I generate this quarter?",
  "What are my outstanding receivables?",
];

// Aiva will remain hidden unless localStorage.aiva_enabled === 'true'
export const Aiva = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const performanceData = usePerformanceData();

  // Note: chat bubble is visible by default. Use localStorage('aiva_enabled') if you want to gate it later.

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (question?: string) => {
    const userQuestion = (question || input || '').trim();
    if (!userQuestion || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: userQuestion,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const dataContext = {
        summary: {
          businessName: (performanceData as any).businessName ?? '',
          period: (performanceData as any).period ?? '',
          totalRevenue: (performanceData as any).totalRevenue ?? 0,
          invoicesCreated: (performanceData as any).invoicesCreated ?? 0,
          quotationsSent: (performanceData as any).quotationsSent ?? 0,
          quotationsAccepted: (performanceData as any).quotationsAccepted ?? 0,
          clientsCount: (performanceData as any).clientsCount ?? 0,
          tdsAmount: (performanceData as any).tdsAmount ?? 0,
          paidInvoices: (performanceData as any).paidInvoices ?? 0,
          pendingInvoices: (performanceData as any).pendingInvoices ?? 0,
          overDueInvoices: (performanceData as any).overDueInvoices ?? 0,
          totalGstCollected: (performanceData as any).totalGstCollected ?? 0,
          cashIn: (performanceData as any).cashIn ?? 0,
          cashOut: (performanceData as any).cashOut ?? 0,
        },
        invoices: (performanceData as any).invoices ?? [],
        journals: (performanceData as any).journals ?? [],
        accounts: (performanceData as any).accounts ?? [],
        inventories: (performanceData as any).inventories ?? [],
        revenueByClient: (performanceData as any).revenueByClient ?? []
      };

      const { data, error } = await supabase.functions.invoke('financial-advisor', {
        body: { question: userQuestion, dataContext }
      });

      if (error) throw error;

      const assistantText = data?.response || 'I could not generate a response.';

      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantText,
        timestamp: new Date(),
        actionLink: data?.actionLink || null,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('Aiva error:', err);
      const errorMessage = err?.message || 'Sorry, I encountered an error. Please try again.';
      toast({ title: 'Aiva error', description: errorMessage, variant: 'destructive' });
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'FileText':
        return <FileText className="h-4 w-4" />;
      case 'FileCheck':
        return <FileCheck className="h-4 w-4" />;
      default:
        return <ArrowRight className="h-4 w-4" />;
    }
  };

  const handleActionClick = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  // Always render the chat bubble so user can open the chat.

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-gradient-to-r from-[#5D62F2] to-[#FD7C52] hover:shadow-xl transition-all"
      >
        <Sparkles className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50 transition-all",
      isMinimized ? "w-64" : "w-96"
    )}>
      <Card className={cn(
        "shadow-2xl transition-all",
        isMinimized ? "h-14" : "h-[600px]"
      )}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 bg-gradient-to-r from-[#5D62F2] to-[#FD7C52] text-white rounded-t-lg">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base text-white">Aiva</CardTitle>
              {!isMinimized && (
                <CardDescription className="text-xs text-white/80">Your AI Financial Assistant</CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-white/20" onClick={() => setIsMinimized(!isMinimized)}>
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-white/20" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {!isMinimized && (
          <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden p-4 h-[calc(600px-60px)]">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Try asking:</p>
                <div className="grid grid-cols-1 gap-2">
                  {suggestedQuestions.map((question, idx) => (
                    <Button key={idx} variant="outline" className="justify-start h-auto py-2 px-3 text-left whitespace-normal text-xs" onClick={() => handleSend(question)} disabled={isLoading}>
                      <Lightbulb className="h-3 w-3 mr-2 flex-shrink-0" />
                      <span>{question}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <ScrollArea ref={scrollRef} className="flex-1 pr-4">
              <div className="space-y-4">
                {messages.map((message, idx) => (
                  <div key={idx} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'assistant' && (
                      <Avatar className="h-7 w-7 bg-gradient-to-r from-[#5D62F2] to-[#FD7C52]">
                        <AvatarFallback className="bg-transparent"><Sparkles className="h-3 w-3 text-white" /></AvatarFallback>
                      </Avatar>
                    )}

                    <div className={`rounded-lg px-3 py-2 max-w-[75%] text-sm ${message.role === 'user' ? 'bg-gradient-to-r from-[#5D62F2] to-[#FD7C52] text-white' : 'bg-muted'}`}>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      {message.role === 'assistant' && message.actionLink && (
                        <div className="mt-2 pt-2 border-t border-current/20">
                          <Button onClick={() => handleActionClick(message.actionLink!.path)} variant="outline" size="sm" className={`w-full justify-start text-xs`}>{getIconComponent(message.actionLink.icon)}<span className="ml-1">{message.actionLink.label}</span><ArrowRight className="h-3 w-3 ml-auto"/></Button>
                        </div>
                      )}
                      <div className={`text-xs mt-2 ${message.role === 'user' ? 'text-white/70' : 'text-muted-foreground'}`}>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>

                    {message.role === 'user' && (
                      <Avatar className="h-7 w-7 bg-secondary"><AvatarFallback><User className="h-3 w-3" /></AvatarFallback></Avatar>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-2 justify-start">
                    <Avatar className="h-7 w-7 bg-gradient-to-r from-[#5D62F2] to-[#FD7C52]"><AvatarFallback className="bg-transparent"><Sparkles className="h-3 w-3 text-white" /></AvatarFallback></Avatar>
                    <div className="rounded-lg px-3 py-2 bg-muted"><Loader2 className="h-4 w-4 animate-spin" /></div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={handleKeyPress} placeholder="Ask Aiva anything..." className="min-h-[50px] resize-none text-sm" disabled={isLoading} />
              <Button onClick={() => handleSend()} disabled={!input.trim() || isLoading} size="icon" className="h-[50px] w-[50px] bg-gradient-to-r from-[#5D62F2] to-[#FD7C52]">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default Aiva;
