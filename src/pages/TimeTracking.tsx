
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Play, Pause, Square, Clock, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

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
  created_at: string;
}

const TimeTracking = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [formData, setFormData] = useState({
    project_name: '',
    client_name: '',
    task_description: '',
    hourly_rate: '',
  });

  useEffect(() => {
    fetchTimeEntries();
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchTimeEntries = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_tracking')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to match our interface
      const transformedData: TimeEntry[] = (data || []).map(entry => ({
        ...entry,
        status: entry.status as 'active' | 'paused' | 'completed'
      }));
      
      setTimeEntries(transformedData);
      
      // Find active entry
      const active = transformedData.find(entry => entry.status === 'active');
      setActiveEntry(active || null);
    } catch (error) {
      console.error('Error fetching time entries:', error);
      toast({
        title: "Error",
        description: "Failed to fetch time entries.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : currentTime;
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const resetForm = () => {
    setFormData({
      project_name: '',
      client_name: '',
      task_description: '',
      hourly_rate: '',
    });
    setEditingEntry(null);
  };

  const startTimer = async () => {
    if (!user?.id) return;

    if (!formData.project_name) {
      toast({
        title: "Validation Error",
        description: "Project name is required.",
        variant: "destructive",
      });
      return;
    }

    // Stop any existing active timer
    if (activeEntry) {
      await stopTimer();
    }

    const entryData = {
      user_id: user.id,
      project_name: formData.project_name,
      client_name: formData.client_name || null,
      task_description: formData.task_description || null,
      start_time: new Date().toISOString(),
      hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
      status: 'active' as const,
    };

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_tracking')
        .insert([entryData])
        .select()
        .single();

      if (error) throw error;
      
      const transformedEntry: TimeEntry = {
        ...data,
        status: data.status as 'active' | 'paused' | 'completed'
      };
      
      setActiveEntry(transformedEntry);
      setIsDialogOpen(false);
      resetForm();
      fetchTimeEntries();
      toast({ title: "Success", description: "Timer started!" });
    } catch (error) {
      console.error('Error starting timer:', error);
      toast({
        title: "Error",
        description: "Failed to start timer.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stopTimer = async () => {
    if (!activeEntry) return;

    const endTime = new Date().toISOString();
    const durationMinutes = calculateDuration(activeEntry.start_time, endTime);
    const totalAmount = activeEntry.hourly_rate ? (durationMinutes / 60) * activeEntry.hourly_rate : null;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('time_tracking')
        .update({
          end_time: endTime,
          duration_minutes: durationMinutes,
          total_amount: totalAmount,
          status: 'completed',
        })
        .eq('id', activeEntry.id);

      if (error) throw error;
      
      setActiveEntry(null);
      fetchTimeEntries();
      toast({ title: "Success", description: "Timer stopped!" });
    } catch (error) {
      console.error('Error stopping timer:', error);
      toast({
        title: "Error",
        description: "Failed to stop timer.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this time entry?')) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('time_tracking')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: "Success", description: "Time entry deleted!" });
      fetchTimeEntries();
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast({
        title: "Error",
        description: "Failed to delete entry.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTotalHoursToday = () => {
    const today = new Date().toDateString();
    const todayEntries = timeEntries.filter(entry => 
      new Date(entry.start_time).toDateString() === today
    );
    
    const totalMinutes = todayEntries.reduce((sum, entry) => {
      if (entry.status === 'active') {
        return sum + calculateDuration(entry.start_time);
      }
      return sum + (entry.duration_minutes || 0);
    }, 0);
    
    return totalMinutes;
  };

  const getTotalEarningsToday = () => {
    const today = new Date().toDateString();
    const todayEntries = timeEntries.filter(entry => 
      new Date(entry.start_time).toDateString() === today && entry.total_amount
    );
    
    return todayEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Time Tracking</h1>
            <p className="text-muted-foreground">Track time spent on projects and tasks</p>
          </div>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} disabled={!!activeEntry}>
              <Plus className="h-4 w-4 mr-2" />
              Start New Timer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start New Timer</DialogTitle>
              <DialogDescription>Fill in the project details to start tracking time</DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project_name">Project Name *</Label>
                <Input
                  id="project_name"
                  value={formData.project_name}
                  onChange={(e) => setFormData({...formData, project_name: e.target.value})}
                  placeholder="Project or task name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="client_name">Client Name</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                  placeholder="Client or company name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="task_description">Task Description</Label>
                <Textarea
                  id="task_description"
                  value={formData.task_description}
                  onChange={(e) => setFormData({...formData, task_description: e.target.value})}
                  placeholder="Brief description of the task"
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Hourly Rate (₹)</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData({...formData, hourly_rate: e.target.value})}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={startTimer} disabled={isLoading}>
                  <Play className="h-4 w-4 mr-2" />
                  {isLoading ? "Starting..." : "Start Timer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Today's Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Today's Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(getTotalHoursToday())}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Today's Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{getTotalEarningsToday().toFixed(2)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Active Timer</CardTitle>
          </CardHeader>
          <CardContent>
            {activeEntry ? (
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {formatDuration(calculateDuration(activeEntry.start_time))}
                </div>
                <div className="text-sm text-muted-foreground">{activeEntry.project_name}</div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2" 
                  onClick={stopTimer}
                  disabled={isLoading}
                >
                  <Square className="h-4 w-4 mr-1" />
                  Stop
                </Button>
              </div>
            ) : (
              <div className="text-muted-foreground">No active timer</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Time Entries List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Recent Time Entries</h2>
        
        {isLoading ? (
          <div className="text-center py-8">Loading time entries...</div>
        ) : timeEntries.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No time entries yet</h3>
              <p className="text-muted-foreground mb-4">Start your first timer to begin tracking time</p>
              <Button onClick={() => {
                resetForm();
                setIsDialogOpen(true);
              }}>
                <Play className="h-4 w-4 mr-2" />
                Start Timer
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {timeEntries.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium">{entry.project_name}</h3>
                        <Badge className={getStatusColor(entry.status)}>
                          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                        {entry.client_name && (
                          <div>
                            <span className="font-medium">Client:</span> {entry.client_name}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Date:</span> {new Date(entry.start_time).toLocaleDateString()}
                        </div>
                        <div>
                          <span className="font-medium">Duration:</span> {
                            entry.status === 'active' 
                              ? formatDuration(calculateDuration(entry.start_time))
                              : formatDuration(entry.duration_minutes || 0)
                          }
                        </div>
                        {entry.total_amount && (
                          <div>
                            <span className="font-medium">Amount:</span> ₹{entry.total_amount.toFixed(2)}
                          </div>
                        )}
                      </div>
                      
                      {entry.task_description && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          <span className="font-medium">Task:</span> {entry.task_description}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      {entry.status === 'completed' && (
                        <Button variant="outline" size="sm" onClick={() => handleDelete(entry.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeTracking;
