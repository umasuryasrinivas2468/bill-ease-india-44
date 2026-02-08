import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sparkles, User, ExternalLink, FileText, Users, BookOpen, FileCheck, Package, ShoppingCart, Truck, HelpCircle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionLink {
  label: string;
  path: string;
  icon: string;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  recordType?: string;
  recordId?: string;
  success?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
  onNavigate?: (path: string) => void;
}

const getRecordIcon = (type?: string) => {
  switch (type) {
    case 'invoice': return <FileText className="h-3 w-3" />;
    case 'client': return <Users className="h-3 w-3" />;
    case 'journal': return <BookOpen className="h-3 w-3" />;
    case 'quotation': return <FileCheck className="h-3 w-3" />;
    case 'vendor': return <Users className="h-3 w-3" />;
    case 'sales_order': return <ShoppingCart className="h-3 w-3" />;
    case 'purchase_order': return <Truck className="h-3 w-3" />;
    case 'inventory': return <Package className="h-3 w-3" />;
    case 'answer': return <HelpCircle className="h-3 w-3" />;
    case 'report': return <BarChart3 className="h-3 w-3" />;
    default: return null;
  }
};

const getRecordPath = (type?: string) => {
  switch (type) {
    case 'invoice': return '/invoices';
    case 'client': return '/clients';
    case 'journal': return '/accounting/manual-journals';
    case 'quotation': return '/quotations';
    case 'vendor': return '/vendors';
    case 'sales_order': return '/sales-orders';
    case 'purchase_order': return '/purchase-orders';
    case 'inventory': return '/inventory';
    case 'report': return '/reports';
    default: return null;
  }
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onNavigate }) => {
  const isUser = message.role === 'user';
  const path = getRecordPath(message.recordType);

  return (
    <div className={cn(
      "flex gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
      isUser ? "justify-end" : "justify-start"
    )}>
      {!isUser && (
        <Avatar className="h-8 w-8 shrink-0 bg-gradient-to-br from-orange-500 to-blue-600">
          <AvatarFallback className="bg-transparent text-white">
            <Sparkles className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
        isUser 
          ? "bg-gradient-to-r from-orange-500 to-blue-600 text-white" 
          : "bg-muted/80 backdrop-blur-sm"
      )}>
        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
        
        {!isUser && message.recordType && message.success && path && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate?.(path)}
            className="mt-2 h-7 px-2 text-xs gap-1 hover:bg-background/50"
          >
            {getRecordIcon(message.recordType)}
            View {message.recordType.replace('_', ' ')}
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}

        <div className={cn(
          "text-[10px] mt-2 opacity-60",
          isUser ? "text-white/70" : "text-muted-foreground"
        )}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {isUser && (
        <Avatar className="h-8 w-8 shrink-0 bg-secondary">
          <AvatarFallback>
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

export default ChatMessage;
