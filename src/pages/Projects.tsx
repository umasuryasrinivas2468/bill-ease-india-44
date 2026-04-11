import React, { useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { FolderKanban, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import ProjectExpenses from '@/components/projects/ProjectExpenses';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useClients } from '@/hooks/useClients';
import { Project, ProjectTask, ProjectUser, useCreateProject, useDeleteProject, useProjects, useUpdateProject } from '@/hooks/useProjects';

const billingMethods = ['Hourly', 'Fixed Cost', 'Non Billable', 'Retainer'];
const emptyUser = (): ProjectUser => ({ id: crypto.randomUUID(), name: '', email: '' });
const emptyTask = (): ProjectTask => ({ id: crypto.randomUUID(), name: '', description: '', billable: true });
const emptyForm = () => ({ project_name: '', project_code: '', client_id: '', billing_method: 'Hourly', description: '', assigned_users: [] as ProjectUser[], tasks: [] as ProjectTask[] });

const Projects = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: projects = [], isLoading } = useProjects();
  const { data: clients = [] } = useClients();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm());

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((project) => [project.project_name, project.project_code || '', project.client_name || '', project.billing_method].some((value) => value.toLowerCase().includes(term)));
  }, [projects, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      assigned_users: user ? [{ id: crypto.randomUUID(), name: user.fullName || user.username || 'Current User', email: user.primaryEmailAddress?.emailAddress || '' }] : [],
      tasks: [emptyTask()],
    });
    setOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setForm({
      project_name: project.project_name,
      project_code: project.project_code || '',
      client_id: project.client_id || '',
      billing_method: project.billing_method,
      description: project.description || '',
      assigned_users: project.assigned_users?.length ? project.assigned_users : [emptyUser()],
      tasks: project.tasks?.length ? project.tasks : [emptyTask()],
    });
    setOpen(true);
  };

  const closeDialog = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setEditing(null);
      setForm(emptyForm());
    }
  };

  const saveProject = async () => {
    if (!form.project_name.trim()) {
      toast({ title: 'Validation Error', description: 'Project name is required.', variant: 'destructive' });
      return;
    }
    const client = clients.find((item) => item.id === form.client_id);
    if (!client) {
      toast({ title: 'Validation Error', description: 'Customer name is required.', variant: 'destructive' });
      return;
    }

    const payload = {
      project_name: form.project_name.trim(),
      project_code: form.project_code.trim() || null,
      client_id: client.id,
      client_name: client.name,
      billing_method: form.billing_method,
      description: form.description.trim() || null,
      assigned_users: form.assigned_users.map((item) => ({ ...item, name: item.name.trim(), email: item.email.trim() })).filter((item) => item.name || item.email),
      tasks: form.tasks.map((item) => ({ ...item, name: item.name.trim(), description: item.description.trim() })).filter((item) => item.name),
    };

    try {
      if (editing) {
        await updateProject.mutateAsync({ id: editing.id, ...payload });
      } else {
        await createProject.mutateAsync(payload);
      }
      toast({ title: editing ? 'Project updated' : 'Project created', description: payload.project_name });
      closeDialog(false);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to save project.', variant: 'destructive' });
    }
  };

  const removeProject = async (project: Project) => {
    if (!window.confirm(`Delete project "${project.project_name}"?`)) return;
    try {
      await deleteProject.mutateAsync(project.id);
      toast({ title: 'Project deleted', description: project.project_name });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to delete project.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">Create and manage projects in your space</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={closeDialog}>
          <DialogTrigger asChild>
            <Button variant="orange" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Project</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Project' : 'New Project'}</DialogTitle>
              <DialogDescription>Project details, users, and task lines.</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Project Name *</Label><Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Project Code</Label><Input value={form.project_code} onChange={(e) => setForm({ ...form, project_code: e.target.value })} /></div>
                <div className="space-y-2"><Label>Customer Name *</Label><Select value={form.client_id} onValueChange={(value) => setForm({ ...form, client_id: value })}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Billing Method *</Label><Select value={form.billing_method} onValueChange={(value) => setForm({ ...form, billing_method: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{billingMethods.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-lg">Users</CardTitle><Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, assigned_users: [...form.assigned_users, emptyUser()] })}><Plus className="mr-2 h-4 w-4" />Add User</Button></CardHeader>
                <CardContent>
                  <Table><TableHeader><TableRow><TableHead>S.No</TableHead><TableHead>User</TableHead><TableHead>Email</TableHead><TableHead className="text-right"> </TableHead></TableRow></TableHeader><TableBody>{form.assigned_users.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No users added</TableCell></TableRow> : form.assigned_users.map((item, index) => <TableRow key={item.id}><TableCell>{index + 1}</TableCell><TableCell><Input value={item.name} onChange={(e) => setForm({ ...form, assigned_users: form.assigned_users.map((user) => user.id === item.id ? { ...user, name: e.target.value } : user) })} /></TableCell><TableCell><Input value={item.email} onChange={(e) => setForm({ ...form, assigned_users: form.assigned_users.map((user) => user.id === item.id ? { ...user, email: e.target.value } : user) })} /></TableCell><TableCell className="text-right"><Button type="button" size="icon" variant="ghost" onClick={() => setForm({ ...form, assigned_users: form.assigned_users.filter((user) => user.id !== item.id) })}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-lg">Project Tasks</CardTitle><Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, tasks: [...form.tasks, emptyTask()] })}><Plus className="mr-2 h-4 w-4" />Add Task</Button></CardHeader>
                <CardContent>
                  <Table><TableHeader><TableRow><TableHead>S.No</TableHead><TableHead>Task Name</TableHead><TableHead>Description</TableHead><TableHead>Billable</TableHead><TableHead className="text-right"> </TableHead></TableRow></TableHeader><TableBody>{form.tasks.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No tasks added</TableCell></TableRow> : form.tasks.map((item, index) => <TableRow key={item.id}><TableCell>{index + 1}</TableCell><TableCell><Input value={item.name} onChange={(e) => setForm({ ...form, tasks: form.tasks.map((task) => task.id === item.id ? { ...task, name: e.target.value } : task) })} /></TableCell><TableCell><Input value={item.description} onChange={(e) => setForm({ ...form, tasks: form.tasks.map((task) => task.id === item.id ? { ...task, description: e.target.value } : task) })} /></TableCell><TableCell><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.billable} onChange={(e) => setForm({ ...form, tasks: form.tasks.map((task) => task.id === item.id ? { ...task, billable: e.target.checked } : task) })} />Billable</label></TableCell><TableCell className="text-right"><Button type="button" size="icon" variant="ghost" onClick={() => setForm({ ...form, tasks: form.tasks.filter((task) => task.id !== item.id) })}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table>
                </CardContent>
              </Card>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => closeDialog(false)}>Cancel</Button><Button variant="orange" onClick={saveProject} disabled={createProject.isPending || updateProject.isPending}>{editing ? 'Update Project' : 'Create Project'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total Projects</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{projects.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Customers</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{new Set(projects.map((project) => project.client_name).filter(Boolean)).size}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Assigned Users</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{projects.reduce((sum, project) => sum + (project.assigned_users?.length || 0), 0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Task Lines</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{projects.reduce((sum, project) => sum + (project.tasks?.length || 0), 0)}</div></CardContent></Card>
      </div>

      <Card><CardContent className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects" /></div></CardContent></Card>

      {isLoading ? <Card><CardContent className="py-12 text-center text-muted-foreground">Loading projects...</CardContent></Card> : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center"><FolderKanban className="mb-4 h-12 w-12 text-muted-foreground" /><h3 className="text-lg font-semibold">No projects yet</h3><p className="mt-2 max-w-xl text-sm text-muted-foreground">Create your first project to start assigning users and tracking time.</p><Button className="mt-6" variant="orange" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create Project</Button></CardContent></Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {filtered.map((project) => (
            <Card key={project.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><CardTitle className="text-xl">{project.project_name}</CardTitle><Badge variant="outline">{project.billing_method}</Badge></div>
                  <CardDescription>{project.client_name || 'No customer selected'}{project.project_code ? ` - ${project.project_code}` : ''}</CardDescription>
                </div>
                <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(project)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => removeProject(project)}><Trash2 className="h-4 w-4" /></Button></div>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm"><div className="font-medium">Users</div>{(project.assigned_users || []).length === 0 ? <div className="mt-2 text-muted-foreground">No users assigned</div> : project.assigned_users.map((item) => <div key={item.id} className="mt-2"><div className="font-medium">{item.name || 'Unnamed user'}</div><div className="text-muted-foreground">{item.email || 'No email'}</div></div>)}</div>
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm"><div className="font-medium">Tasks</div>{(project.tasks || []).length === 0 ? <div className="mt-2 text-muted-foreground">No tasks added</div> : project.tasks.map((item) => <div key={item.id} className="mt-2"><div className="flex items-center gap-2"><span className="font-medium">{item.name}</span>{item.billable && <Badge variant="secondary">Billable</Badge>}</div>{item.description && <div className="text-muted-foreground">{item.description}</div>}</div>)}</div>
                </div>
                <ProjectExpenses projectId={project.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Projects;
