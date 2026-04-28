import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Bell, Plus, Mail, MessageSquare, Phone } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { normalizeUserId } from '@/lib/userUtils';

type Channel = 'email' | 'whatsapp' | 'sms';
const CHANNEL_ICON: Record<Channel, React.ElementType> = {
  email: Mail, whatsapp: MessageSquare, sms: Phone,
};

interface Rule {
  id: string;
  name: string;
  trigger_type: 'before_due' | 'on_due' | 'after_due' | 'escalation';
  offset_days: number;
  channels: Channel[];
  template?: string;
  is_active: boolean;
}

// #7 Smart Reminder Automation — rule editor for "before due / on due /
// after due / escalation" reminders, with channels Email + WhatsApp + SMS.
// Rules persist; the actual dispatcher is expected to be a backend job that
// reads `invoice_reminder_log` (queued by app on rule match).
const SmartReminderConfig: React.FC = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<Rule['trigger_type']>('before_due');
  const [offset, setOffset] = useState('3');
  const [channels, setChannels] = useState<Channel[]>(['email']);
  const [template, setTemplate] = useState('');

  const { data: rules = [] } = useQuery({
    queryKey: ['reminder-rules', uid],
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('invoice_reminder_rules')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Rule[];
    },
    enabled: !!uid,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not signed in');
      if (!name) throw new Error('Name required');
      if (channels.length === 0) throw new Error('Pick at least one channel');
      const { error } = await supabase.from('invoice_reminder_rules').insert({
        user_id: uid,
        name,
        trigger_type: trigger,
        offset_days: Math.abs(Number(offset || 0)),
        channels,
        template,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Rule added' });
      qc.invalidateQueries({ queryKey: ['reminder-rules', uid] });
      setName(''); setOffset('3'); setTemplate('');
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('invoice_reminder_rules')
        .update({ is_active: active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminder-rules', uid] }),
  });

  const flip = (c: Channel) => {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" /> Smart Reminder Automation
        </CardTitle>
        <CardDescription>
          Send reminders before due, on due, after overdue or as escalation. Channels: Email,
          WhatsApp, SMS.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-sm">New rule</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">Rule name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Friendly nudge 3d before due" />
              </div>
              <div>
                <Label className="text-xs">Trigger</Label>
                <Select value={trigger} onValueChange={(v) => setTrigger(v as Rule['trigger_type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before_due">Before due date</SelectItem>
                    <SelectItem value="on_due">On due date</SelectItem>
                    <SelectItem value="after_due">After overdue</SelectItem>
                    <SelectItem value="escalation">Escalation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Offset (days)</Label>
                <Input type="number" value={offset} onChange={(e) => setOffset(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Channels</Label>
                <div className="flex gap-3 items-center mt-2">
                  {(['email','whatsapp','sms'] as Channel[]).map((c) => {
                    const Icon = CHANNEL_ICON[c];
                    const on = channels.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => flip(c)}
                        className={`px-2 py-1 rounded border text-xs flex items-center gap-1 ${on ? 'bg-primary text-primary-foreground' : ''}`}
                      >
                        <Icon className="h-3 w-3" /> {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="flex-1">
                <Label className="text-xs">Template (optional)</Label>
                <Input
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="Hi {customer}, invoice {invoice_no} of {amount} is due on {due_date}…"
                />
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                <Plus className="h-4 w-4 mr-2" /> Add rule
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Active</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Offset</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Template</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No reminder rules yet.</TableCell></TableRow>
              )}
              {rules.map((r: Rule) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => toggle.mutate({ id: r.id, active: v })}
                    />
                  </TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell><Badge variant="outline">{r.trigger_type.replace('_', ' ')}</Badge></TableCell>
                  <TableCell>{r.offset_days}d</TableCell>
                  <TableCell className="flex gap-1">
                    {r.channels.map((c) => {
                      const Icon = CHANNEL_ICON[c];
                      return <Badge key={c} variant="secondary"><Icon className="h-3 w-3 mr-1" />{c}</Badge>;
                    })}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-xs">{r.template || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartReminderConfig;
