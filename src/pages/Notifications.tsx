import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Bell, CalendarClock, CheckCircle, Clock3, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useNotificationsFeed, NotificationItem } from '@/hooks/useNotificationsFeed';

const toneStyles: Record<NotificationItem['tone'], string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const kindIcons: Record<NotificationItem['kind'], React.ReactNode> = {
  invoice: <FileText className="h-4 w-4" />,
  purchase_bill: <FileText className="h-4 w-4" />,
  recurring_expense: <Clock3 className="h-4 w-4" />,
  compliance: <CalendarClock className="h-4 w-4" />,
};

const Notifications = () => {
  const { items, summary, isLoading } = useNotificationsFeed();

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">Loading reminders and alerts...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-4">
          <Card><CardContent className="h-24" /></Card>
          <Card><CardContent className="h-96" /></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">Track invoice dues, compliance deadlines, bills, and recurring reminders</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total alerts</p>
            <p className="mt-2 text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Urgent</p>
            <p className="mt-2 text-2xl font-bold text-red-600">{summary.critical}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Due today</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">{summary.warning}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Upcoming</p>
            <p className="mt-2 text-2xl font-bold text-blue-600">{summary.info}</p>
          </CardContent>
        </Card>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="mb-4 h-12 w-12 text-emerald-500" />
            <div className="text-lg font-semibold">Everything is up to date</div>
            <div className="mt-2 text-muted-foreground">No pending invoice, compliance, or payment reminders right now.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 rounded-xl border p-2 ${toneStyles[item.tone]}`}>
                      {kindIcons[item.kind]}
                    </div>
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{item.title}</h3>
                        <Badge variant="outline">{item.relativeLabel}</Badge>
                        <Badge className={toneStyles[item.tone]}>{item.kind.replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <Link
                    to={item.route}
                    className="shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    Open
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-primary" />
              What gets notified
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>Invoice reminders for overdue, due today, and upcoming dues.</p>
            <p>Purchase bill reminders for vendor payments coming due.</p>
            <p>Recurring expense reminders based on the next due date.</p>
            <p>Compliance reminders from the compliance calendar for upcoming and overdue filings.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Notifications;
