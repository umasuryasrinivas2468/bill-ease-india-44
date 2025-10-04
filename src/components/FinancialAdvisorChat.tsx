import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Brain, Send, Loader2, User, TrendingUp, Calculator, BarChart3, Lightbulb } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { usePerformanceData } from '@/hooks/usePerformanceData';

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

export const FinancialAdvisorChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Get all financial data using the performance hook
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
      // Prepare financial context from performance data
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
      console.error('Financial advisor error:', error);
      
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

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          AI Financial Advisor
        </CardTitle>
        <CardDescription>
          Ask questions about your financial data and get instant insights
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Suggested Questions */}
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Try asking:</p>
            <div className="grid grid-cols-1 gap-2">
              {suggestedQuestions.map((question, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  className="justify-start h-auto py-3 px-4 text-left whitespace-normal"
                  onClick={() => handleSend(question)}
                  disabled={isLoading}
                >
                  <Lightbulb className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="text-sm">{question}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.map((message, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <Avatar className="h-8 w-8 bg-primary">
                    <AvatarFallback>
                      <Brain className="h-4 w-4 text-primary-foreground" />
                    </AvatarFallback>
                  </Avatar>
                )}
                
                <div
                  className={`rounded-lg px-4 py-3 max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                  <div className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}>
                    {message.timestamp.toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>

                {message.role === 'user' && (
                  <Avatar className="h-8 w-8 bg-secondary">
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <Avatar className="h-8 w-8 bg-primary">
                  <AvatarFallback>
                    <Brain className="h-4 w-4 text-primary-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="rounded-lg px-4 py-3 bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your finances... (Press Enter to send)"
            className="min-h-[60px] resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-[60px] w-[60px]"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
