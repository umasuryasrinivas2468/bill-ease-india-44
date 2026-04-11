import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Clock, FolderClock, IndianRupee, Play, Plus, Square, Trash2 } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { supabase } from '@/lib/supabase';

interface TimeEntry {
  id: string;
  project_name: string;
  client_name?: string;
  task_description?: string;
  start_time: string;
  end_time?: string;
  duration_minutes?: number;
  hourly_rate?: number;
  total_amount?: number;
  status: 'active' | 'paused' | 'completed';
}

const TimeTracking = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: projects = [] } = useProjects();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [form, setForm] = useState({ project_id: '', client_name: '', task_description: '', hourly_rate: '' });

  useEffect(() => {
    loadEntries();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [user]);

  const projectOptions = useMemo(() => projects.map((project) => ({ id: project.id, name: project.project_name, clientName: project.client_name || '', taskNames: project.tasks?.map((task) => task.name).filter(Boolean) || [] })), [projects]);
  const totalLoggedMinutes = useMemo(() => entries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0), [entries]);

  const loadEntries = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('time_tracking').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []).map((entry) => ({ ...entry, status: entry.status as TimeEntry['status'] })) as TimeEntry[];
      setEntries(rows);
      setActiveEntry(rows.find((entry) => entry.status === 'active') || null);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to fetch time entries.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const getDuration = (start: string, end?: string) => Math.floor(((end ? new Date(end) : now).getTime() - new Date(start).getTime()) / 60000);
  const resetForm = () => setForm({ project_id: '', client_name: '', task_description: '', hourly_rate: '' });

  const startTimer = async () => {
    const project = projects.find((item) => item.id === form.project_id);
    if (!user?.id || !project) {
      toast({ title: 'Validation Error', description: 'Please select a project.', variant: 'destructive' });
      return;
    }
    if (activeEntry) await stopTimer();

    setIsLoading(true);
    try {
      const { error } = await supabase.from('time_tracking').insert([{
        user_id: user.id,
        project_name: project.project_name,
        client_name: project.client_name || form.client_name || null,
        task_description: form.task_description || null,
        start_time: new Date().toISOString(),
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        status: 'active',
      }]);
      if (error) throw error;
      setOpen(false);
      resetForm();
      await loadEntries();
      toast({ title: 'Success', description: 'Timer started.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to start timer.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const stopTimer = async () => {
    if (!activeEntry) return;
    const end = new Date().toISOString();
    const minutes = getDuration(activeEntry.start_time, end);
    setIsLoading(true);
    try {
      const { error } = await supabase.from('time_tracking').update({ end_time: end, duration_minutes: minutes, total_amount: activeEntry.hourly_rate ? (minutes / 60) * activeEntry.hourly_rate : null, status: 'completed' }).eq('id', activeEntry.id);
      if (error) throw error;
      await loadEntries();
      toast({ title: 'Success', description: 'Timer stopped.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to stop timer.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this timesheet entry?')) return;
    try {
      const { error } = await supabase.from('time_tracking').delete().eq('id', id);
      if (error) throw error;
      await loadEntries();
      toast({ title: 'Deleted', description: 'Time entry removed.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to delete entry.', variant: 'destructive' });
    }
  };

  const todayMinutes = entries.filter((entry) => new Date(entry.start_time).toDateString() === new Date().toDateString()).reduce((sum, entry) => sum + (entry.status === 'active' ? getDuration(entry.start_time) : (entry.duration_minutes || 0)), 0);
  const todayEarnings = entries.filter((entry) => new Date(entry.start_time).toDateString() === new Date().toDateString()).reduce((sum, entry) => sum + (entry.total_amount || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Timesheet</h1>
            <p className="text-muted-foreground">Track billable and non-billable hours against your projects</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} disabled={!!activeEntry || projectOptions.length === 0}><Plus className="mr-2 h-4 w-4" />Start Timer</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Timesheet Entry</DialogTitle>
              <DialogDescription>Select a project and start tracking time.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select value={form.project_id} onValueChange={(value) => {
                  const selected = projectOptions.find((project) => project.id === value);
                  setForm({ ...form, project_id: value, client_name: selected?.clientName || '', task_description: selected?.taskNames[0] || '' });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>{projectOptions.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="client_name">Client Name</Label><Input id="client_name" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="task_description">Task Description</Label><Textarea id="task_description" rows={3} value={form.task_description} onChange={(e) => setForm({ ...form, task_description: e.target.value })} />{form.project_id && <p className="text-xs text-muted-foreground">Suggested tasks: {projectOptions.find((project) => project.id === form.project_id)?.taskNames.join(', ') || 'No tasks added on this project'}</p>}</div>
              <div className="space-y-2"><Label htmlFor="hourly_rate">Hourly Rate (Rs)</Label><Input id="hourly_rate" type="number" min="0" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} /></div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={startTimer} disabled={isLoading}><Play className="mr-2 h-4 w-4" />{isLoading ? 'Starting...' : 'Start Timer'}</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {projectOptions.length === 0 && <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-10 text-center"><FolderClock className="mb-4 h-12 w-12 text-muted-foreground" /><h3 className="text-lg font-semibold">Create a project first</h3><p className="mt-2 max-w-xl text-sm text-muted-foreground">Timesheet entries in Space now use your saved projects.</p></CardContent></Card>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-lg">Today's Hours</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatDuration(todayMinutes)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-lg">Today's Earnings</CardTitle></CardHeader><CardContent><div className="flex items-center gap-1 text-2xl font-bold"><IndianRupee className="h-5 w-5" />{todayEarnings.toFixed(2)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-lg">Logged Hours</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatDuration(totalLoggedMinutes)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-lg">Active Timer</CardTitle></CardHeader><CardContent>{activeEntry ? <div><div className="text-2xl font-bold text-green-600">{formatDuration(getDuration(activeEntry.start_time))}</div><div className="text-sm text-muted-foreground">{activeEntry.project_name}</div><Button variant="outline" size="sm" className="mt-2" onClick={stopTimer} disabled={isLoading}><Square className="mr-1 h-4 w-4" />Stop</Button></div> : <div className="text-muted-foreground">No active timer</div>}</CardContent></Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Recent Time Entries</h2>
        {isLoading ? <div className="py-8 text-center">Loading time entries...</div> : entries.length === 0 ? (
          <Card><CardContent className="py-8 text-center"><Clock className="mx-auto mb-4 h-12 w-12 text-gray-400" /><h3 className="mb-2 text-lg font-medium">No time entries yet</h3><p className="mb-4 text-muted-foreground">Start your first timer to begin tracking time.</p><Button onClick={() => setOpen(true)} disabled={projectOptions.length === 0}><Play className="mr-2 h-4 w-4" />Start Timer</Button></CardContent></Card>
        ) : (
          <div className="space-y-3">{entries.map((entry) => <Card key={entry.id}><CardContent className="py-4"><div className="flex items-center justify-between gap-4"><div className="flex-1"><div className="mb-2 flex items-center gap-3"><h3 className="font-medium">{entry.project_name}</h3><Badge className={entry.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>{entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}</Badge></div><div className="grid grid-cols-1 gap-4 text-sm text-muted-foreground md:grid-cols-4">{entry.client_name && <div><span className="font-medium">Client:</span> {entry.client_name}</div>}<div><span className="font-medium">Date:</span> {new Date(entry.start_time).toLocaleDateString()}</div><div><span className="font-medium">Duration:</span> {entry.status === 'active' ? formatDuration(getDuration(entry.start_time)) : formatDuration(entry.duration_minutes || 0)}</div>{entry.total_amount ? <div><span className="font-medium">Amount:</span> Rs {entry.total_amount.toFixed(2)}</div> : null}</div>{entry.task_description && <div className="mt-2 text-sm text-muted-foreground"><span className="font-medium">Task:</span> {entry.task_description}</div>}</div>{entry.status === 'completed' && <Button variant="outline" size="sm" onClick={() => deleteEntry(entry.id)}><Trash2 className="h-4 w-4" /></Button>}</div></CardContent></Card>)}</div>
        )}
      </div>
    </div>
  );
};

export default TimeTracking;
