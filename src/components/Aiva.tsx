import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Brain, Send, Loader2, User, X, Minimize2, Lightbulb, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { usePerformanceData } from '@/hooks/usePerformanceData';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const suggestedQuestions = [
  "Show me my last month's Profit & Loss",
  "What is my current cash flow status?",
  "Analyze my top expenses",
  "How much revenue did I generate this quarter?",
  "What are my outstanding receivables?",
];

export const Aiva = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const performanceData = usePerformanceData();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (question?: string) => {
    const userQuestion = question || input.trim();
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
          businessName: performanceData.businessName,
          period: performanceData.period,
          totalRevenue: performanceData.totalRevenue,
          invoicesCreated: performanceData.invoicesCreated,
          quotationsSent: performanceData.quotationsSent,
          quotationsAccepted: performanceData.quotationsAccepted,
          clientsCount: performanceData.clientsCount,
          tdsAmount: performanceData.tdsAmount,
          paidInvoices: performanceData.paidInvoices,
          pendingInvoices: performanceData.pendingInvoices,
          overDueInvoices: performanceData.overDueInvoices,
          totalGstCollected: performanceData.totalGstCollected,
          cashIn: performanceData.cashIn,
          cashOut: performanceData.cashOut,
        },
        invoices: performanceData.invoices.map(inv => ({
          invoice_number: inv.invoice_number,
          client_name: inv.client_name,
          total_amount: inv.total_amount,
          status: inv.status,
          invoice_date: inv.invoice_date,
          gst_amount: inv.gst_amount,
        })),
        revenueByClient: performanceData.revenueByClient,
        journals: performanceData.journals.map(j => ({
          journal_number: j.journal_number,
          journal_date: j.journal_date,
          total_debit: j.total_debit,
          total_credit: j.total_credit,
          status: j.status,
        })),
        accounts: performanceData.accounts.map(a => ({
          account_code: a.account_code,
          account_name: a.account_name,
          account_type: a.account_type,
        })),
        inventories: performanceData.inventories.map(i => ({
          product_name: i.product_name,
          stock_quantity: i.stock_quantity,
          selling_price: i.selling_price,
        })),
      };

      const { data, error } = await supabase.functions.invoke('financial-advisor', {
        body: { 
          question: userQuestion,
          dataContext 
        },
      });

      if (error) {
        throw error;
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Aiva error:', error);
      
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      
      if (error?.message?.includes('429')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment before asking another question.';
      } else if (error?.message?.includes('402')) {
        errorMessage = 'AI usage limit reached. Please add credits to continue.';
      }

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });

      const errorMsg: Message = {
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
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
                <CardDescription className="text-xs text-white/80">
                  Your AI Financial Assistant
                </CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-white hover:bg-white/20"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-white hover:bg-white/20"
              onClick={() => setIsOpen(false)}
            >
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
                    <Button
                      key={idx}
                      variant="outline"
                      className="justify-start h-auto py-2 px-3 text-left whitespace-normal text-xs"
                      onClick={() => handleSend(question)}
                      disabled={isLoading}
                    >
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
                  <div
                    key={idx}
                    className={`flex gap-2 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <Avatar className="h-7 w-7 bg-gradient-to-r from-[#5D62F2] to-[#FD7C52]">
                        <AvatarFallback className="bg-transparent">
                          <Sparkles className="h-3 w-3 text-white" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    
                    <div
                      className={`rounded-lg px-3 py-2 max-w-[75%] text-sm ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-[#5D62F2] to-[#FD7C52] text-white'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      <div className={`text-xs mt-1 ${
                        message.role === 'user' ? 'text-white/70' : 'text-muted-foreground'
                      }`}>
                        {message.timestamp.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </div>

                    {message.role === 'user' && (
                      <Avatar className="h-7 w-7 bg-secondary">
                        <AvatarFallback>
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex gap-2 justify-start">
                    <Avatar className="h-7 w-7 bg-gradient-to-r from-[#5D62F2] to-[#FD7C52]">
                      <AvatarFallback className="bg-transparent">
                        <Sparkles className="h-3 w-3 text-white" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="rounded-lg px-3 py-2 bg-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask Aiva anything..."
                className="min-h-[50px] resize-none text-sm"
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="h-[50px] w-[50px] bg-gradient-to-r from-[#5D62F2] to-[#FD7C52]"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
