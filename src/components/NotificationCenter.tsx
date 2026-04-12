import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Bell, CalendarClock, Clock3, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationsFeed, NotificationItem } from '@/hooks/useNotificationsFeed';

const toneClasses: Record<NotificationItem['tone'], string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const kindIcons: Record<NotificationItem['kind'], React.ReactNode> = {
  invoice: <FileText className="h-4 w-4" />,
  purchase_bill: <FileText className="h-4 w-4" />,
  recurring_expense: <Clock3 className="h-4 w-4" />,
  compliance: <CalendarClock className="h-4 w-4" />,
};

interface NotificationCenterProps {
  compact?: boolean;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ compact = false }) => {
  const { items, summary, isLoading } = useNotificationsFeed();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'icon' : 'default'}
          className={`relative rounded-full border border-primary/15 bg-background/70 ${compact ? 'h-10 w-10' : 'h-11 px-4 flex items-center gap-2'}`}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {!compact && <span>Notifications</span>}
          {summary.total > 0 && (
            <Badge className="min-w-5 rounded-full bg-red-500 px-1.5 py-0 text-[10px] text-white hover:bg-red-500">
              {summary.total > 99 ? '99+' : summary.total}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Notifications</h3>
              <p className="text-xs text-muted-foreground">
                Invoices, compliance, bills, and recurring reminders
              </p>
            </div>
            <Link to="/notifications" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="text-red-600 border-red-200">
              {summary.critical} urgent
            </Badge>
            <Badge variant="outline" className="text-amber-600 border-amber-200">
              {summary.warning} today
            </Badge>
            <Badge variant="outline" className="text-blue-600 border-blue-200">
              {summary.info} upcoming
            </Badge>
          </div>
        </div>

        <ScrollArea className="max-h-[420px]">
          <div className="p-3">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading notifications...</div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <Bell className="h-8 w-8 opacity-40" />
                <p>No pending notifications right now.</p>
              </div>
            ) : (
              items.slice(0, 12).map((item) => (
                <Link
                  key={item.id}
                  to={item.route}
                  className="mb-2 block rounded-xl border p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-lg border p-2 ${toneClasses[item.tone]}`}>
                      {kindIcons[item.kind]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium leading-5">{item.title}</p>
                        <Badge variant="outline" className="shrink-0">
                          {item.relativeLabel}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground leading-5">{item.description}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </ScrollArea>

        {items.length > 12 && (
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
            Showing the first 12 notifications. Open the full page to see everything.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationCenter;
