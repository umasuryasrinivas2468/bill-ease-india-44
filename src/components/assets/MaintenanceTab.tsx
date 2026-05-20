import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Wrench, Plus, ShieldCheck, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import {
  useMaintenanceSchedules,
  useMaintenanceRecords,
  useCreateMaintenanceSchedule,
  useCreateMaintenanceRecord,
  useDeactivateMaintenanceSchedule,
  useMaintenanceSummaryForAsset,
} from '@/hooks/useAssetMaintenance';
import type {
  CreateMaintenanceRecordInput,
  CreateMaintenanceScheduleInput,
  MaintenanceRecordType,
  MaintenanceScheduleType,
} from '@/types/assetMaintenance';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const today = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (iso: string) => {
  const t = new Date(today() + 'T00:00:00Z').getTime();
  const d = new Date(iso + 'T00:00:00Z').getTime();
  return Math.round((d - t) / (1000 * 60 * 60 * 24));
};

interface Props {
  assetId: string;
  assetName: string;
}

const MaintenanceTab: React.FC<Props> = ({ assetId, assetName }) => {
  const { data: schedules = [] } = useMaintenanceSchedules(assetId);
  const { data: records = [] } = useMaintenanceRecords(assetId);
  const { data: summary } = useMaintenanceSummaryForAsset(assetId);

  const createSchedule = useCreateMaintenanceSchedule();
  const createRecord = useCreateMaintenanceRecord();
  const deactivate = useDeactivateMaintenanceSchedule();

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [scheduleDraftId, setScheduleDraftId] = useState<string | null>(null);

  const [scheduleDraft, setScheduleDraft] = useState<CreateMaintenanceScheduleInput>({
    asset_id: assetId,
    schedule_type: 'service',
    title: '',
    next_due_date: today(),
    frequency_months: 3,
    reminder_days_before: 7,
  });

  const [recordDraft, setRecordDraft] = useState<CreateMaintenanceRecordInput>({
    asset_id: assetId,
    record_type: 'service',
    status: 'completed',
    performed_on: today(),
    cost: 0,
    gst_amount: 0,
    itc_eligible: true,
    payment_mode: 'bank',
  });

  const submitSchedule = () => {
    if (!scheduleDraft.title.trim()) return;
    createSchedule.mutate(
      { ...scheduleDraft, asset_id: assetId },
      {
        onSuccess: () => {
          setScheduleOpen(false);
          setScheduleDraft({
            asset_id: assetId,
            schedule_type: 'service',
            title: '',
            next_due_date: today(),
            frequency_months: 3,
            reminder_days_before: 7,
          });
        },
      },
    );
  };

  const submitRecord = () => {
    createRecord.mutate(
      { ...recordDraft, asset_id: assetId, schedule_id: scheduleDraftId },
      {
        onSuccess: () => {
          setRecordOpen(false);
          setScheduleDraftId(null);
          setRecordDraft({
            asset_id: assetId,
            record_type: 'service',
            status: 'completed',
            performed_on: today(),
            cost: 0,
            gst_amount: 0,
            itc_eligible: true,
            payment_mode: 'bank',
          });
        },
      },
    );
  };

  const openLogForSchedule = (scheduleId: string, type: MaintenanceRecordType) => {
    setScheduleDraftId(scheduleId);
    setRecordDraft((d) => ({ ...d, record_type: type, performed_on: today() }));
    setRecordOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Lifetime spend</div>
            <div className="text-xl font-bold">{inr(summary?.total_cost || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Repairs</div>
            <div className="text-xl font-bold text-amber-600">{inr(summary?.total_repair_cost || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Events</div>
            <div className="text-xl font-bold">{summary?.completed_events || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Last service</div>
            <div className="text-sm font-medium">{summary?.last_service_on || '—'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Schedules */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Service schedules & AMC contracts
          </CardTitle>
          <Button size="sm" onClick={() => setScheduleOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New schedule
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>AMC end</TableHead>
                <TableHead className="text-right">AMC amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.filter((s) => s.is_active).map((s) => {
                const days = daysFromNow(s.next_due_date);
                const overdue = days < 0;
                const dueSoon = days >= 0 && days <= s.reminder_days_before;
                const amcDays = s.amc_end_date ? daysFromNow(s.amc_end_date) : null;
                const amcExpiring = amcDays !== null && amcDays >= 0 && amcDays <= 30;
                const amcExpired = amcDays !== null && amcDays < 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {s.schedule_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{s.title}</div>
                      {s.frequency_months && (
                        <div className="text-xs text-muted-foreground">every {s.frequency_months} mo</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{s.vendor_name || '—'}</TableCell>
                    <TableCell>
                      <div className="text-sm">{s.next_due_date}</div>
                      {overdue && (
                        <div className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {Math.abs(days)}d overdue
                        </div>
                      )}
                      {dueSoon && !overdue && (
                        <div className="text-xs text-amber-600">due in {days}d</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{s.amc_end_date || '—'}</div>
                      {amcExpired && (
                        <div className="text-xs text-red-600">expired</div>
                      )}
                      {amcExpiring && (
                        <div className="text-xs text-amber-600">in {amcDays}d</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(s.amc_amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          openLogForSchedule(
                            s.id,
                            s.schedule_type === 'amc' ? 'amc_renewal' : 'service',
                          )
                        }
                      >
                        Log service
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deactivate.mutate(s.id)}
                        title="Deactivate"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {schedules.filter((s) => s.is_active).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                    No schedules yet. Add a service plan or AMC contract.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Records */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Maintenance history
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => { setScheduleDraftId(null); setRecordOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Log ad-hoc repair
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Journal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.performed_on}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {r.record_type.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.vendor_name || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.gst_amount)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === 'completed' ? 'default' : 'secondary'}
                      className="text-[10px] capitalize"
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{r.description || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.journal_id ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                    No maintenance events logged.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New maintenance schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select
                  value={scheduleDraft.schedule_type}
                  onValueChange={(v) =>
                    setScheduleDraft({ ...scheduleDraft, schedule_type: v as MaintenanceScheduleType })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">Routine service</SelectItem>
                    <SelectItem value="amc">AMC contract</SelectItem>
                    <SelectItem value="preventive">Preventive</SelectItem>
                    <SelectItem value="calibration">Calibration</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={scheduleDraft.title}
                  onChange={(e) => setScheduleDraft({ ...scheduleDraft, title: e.target.value })}
                  placeholder={`${assetName} — quarterly service`}
                />
              </div>
            </div>

            <div>
              <Label>Vendor / service provider</Label>
              <Input
                value={scheduleDraft.vendor_name || ''}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, vendor_name: e.target.value })}
                placeholder="Vendor name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Next due date</Label>
                <Input
                  type="date"
                  value={scheduleDraft.next_due_date}
                  onChange={(e) => setScheduleDraft({ ...scheduleDraft, next_due_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Frequency (months)</Label>
                <Input
                  type="number"
                  min={1}
                  value={scheduleDraft.frequency_months || ''}
                  onChange={(e) =>
                    setScheduleDraft({
                      ...scheduleDraft,
                      frequency_months: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="e.g. 3 for quarterly"
                />
              </div>
            </div>

            {scheduleDraft.schedule_type === 'amc' && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>AMC start</Label>
                    <Input
                      type="date"
                      value={scheduleDraft.amc_start_date || ''}
                      onChange={(e) =>
                        setScheduleDraft({ ...scheduleDraft, amc_start_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>AMC end</Label>
                    <Input
                      type="date"
                      value={scheduleDraft.amc_end_date || ''}
                      onChange={(e) =>
                        setScheduleDraft({ ...scheduleDraft, amc_end_date: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>AMC amount</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={scheduleDraft.amc_amount || ''}
                    onChange={(e) =>
                      setScheduleDraft({ ...scheduleDraft, amc_amount: Number(e.target.value) })
                    }
                  />
                </div>
              </>
            )}

            <div>
              <Label>Reminder (days before due)</Label>
              <Input
                type="number"
                min={0}
                value={scheduleDraft.reminder_days_before}
                onChange={(e) =>
                  setScheduleDraft({ ...scheduleDraft, reminder_days_before: Number(e.target.value) })
                }
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={scheduleDraft.notes || ''}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={submitSchedule} disabled={createSchedule.isPending}>
              {createSchedule.isPending ? 'Saving…' : 'Save schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log record dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {scheduleDraftId ? 'Log scheduled service' : 'Log maintenance event'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select
                  value={recordDraft.record_type}
                  onValueChange={(v) =>
                    setRecordDraft({ ...recordDraft, record_type: v as MaintenanceRecordType })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                    <SelectItem value="amc_renewal">AMC renewal</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="breakdown">Breakdown</SelectItem>
                    <SelectItem value="calibration">Calibration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Performed on</Label>
                <Input
                  type="date"
                  value={recordDraft.performed_on}
                  onChange={(e) => setRecordDraft({ ...recordDraft, performed_on: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Vendor</Label>
              <Input
                value={recordDraft.vendor_name || ''}
                onChange={(e) => setRecordDraft({ ...recordDraft, vendor_name: e.target.value })}
                placeholder="Service provider"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cost</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={recordDraft.cost || ''}
                  onChange={(e) => setRecordDraft({ ...recordDraft, cost: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>GST</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={recordDraft.gst_amount || ''}
                  onChange={(e) =>
                    setRecordDraft({ ...recordDraft, gst_amount: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Paid via</Label>
                <Select
                  value={recordDraft.payment_mode}
                  onValueChange={(v) =>
                    setRecordDraft({
                      ...recordDraft,
                      payment_mode: v as 'cash' | 'bank' | 'credit',
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="credit">On credit (AP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={recordDraft.status}
                  onValueChange={(v) =>
                    setRecordDraft({
                      ...recordDraft,
                      status: v as 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed (post journal)</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="itc"
                checked={recordDraft.itc_eligible}
                onChange={(e) => setRecordDraft({ ...recordDraft, itc_eligible: e.target.checked })}
              />
              <Label htmlFor="itc" className="font-normal">GST is ITC eligible</Label>
            </div>

            <div>
              <Label>Description / parts replaced</Label>
              <Textarea
                rows={2}
                value={recordDraft.description || ''}
                onChange={(e) => setRecordDraft({ ...recordDraft, description: e.target.value })}
              />
            </div>

            <div className="rounded-md bg-muted p-3 text-xs">
              Posts <span className="font-mono">Dr Repairs &amp; Maintenance Expense</span> /{' '}
              <span className="font-mono">
                Cr {recordDraft.payment_mode === 'credit' ? 'Accounts Payable' : recordDraft.payment_mode === 'cash' ? 'Cash' : 'Bank'}
              </span>{' '}
              when status is completed and cost &gt; 0.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)}>Cancel</Button>
            <Button onClick={submitRecord} disabled={createRecord.isPending}>
              {createRecord.isPending ? 'Saving…' : 'Save & post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaintenanceTab;
