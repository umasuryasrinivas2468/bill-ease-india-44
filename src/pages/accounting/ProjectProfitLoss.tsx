import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, TrendingUp, TrendingDown, FolderKanban, IndianRupee, FileText, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useProjects, Project } from '@/hooks/useProjects';
import { normalizeUserId } from '@/lib/userUtils';

interface ProjectPLData {
  project: Project;
  revenue: number;
  invoiceCount: number;
  expenses: number;
  expenseCount: number;
  profit: number;
  margin: number;
}

const CHART_COLORS = ['#10b981', '#ef4444', '#6366f1', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6'];

const formatINR = (value: number) =>
  `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const ProjectProfitLoss = () => {
  const { user } = useUser();
  const { data: projects = [], isLoading: isLoadingProjects } = useProjects();

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  // Fetch invoices with client_name for revenue matching
  const { data: invoices = [], isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['project-pl-invoices', user?.id, startDate, endDate],
    queryFn: async () => {
      if (!user?.id) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('invoices')
        .select('id, total_amount, paid_amount, invoice_date, status, client_name')
        .eq('user_id', uid)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch expenses with project_id
  const { data: expenses = [], isLoading: isLoadingExpenses } = useQuery({
    queryKey: ['project-pl-expenses', user?.id, startDate, endDate],
    queryFn: async () => {
      if (!user?.id) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('expenses')
        .select('id, total_amount, amount, tax_amount, expense_date, project_id, project_name, category_name')
        .eq('user_id', uid)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const isLoading = isLoadingProjects || isLoadingInvoices || isLoadingExpenses;

  // Build per-project P&L data
  const projectPLData = useMemo(() => {
    if (!projects.length) return [];

    return projects.map((project): ProjectPLData => {
      // Revenue: match invoices by client_name (projects are linked to clients)
      const projectInvoices = project.client_name
        ? invoices.filter(
            (inv) =>
              inv.client_name?.toLowerCase() === project.client_name?.toLowerCase() &&
              (inv.status === 'paid' || inv.status === 'partial')
          )
        : [];

      const revenue = projectInvoices.reduce(
        (sum, inv) => sum + Number(inv.paid_amount || (inv.status === 'paid' ? inv.total_amount : 0)),
        0
      );

      // Expenses: match by project_id
      const projectExpenses = expenses.filter((exp) => exp.project_id === project.id);
      const expenseTotal = projectExpenses.reduce(
        (sum, exp) => sum + Number(exp.total_amount || exp.amount || 0),
        0
      );

      const profit = revenue - expenseTotal;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        project,
        revenue,
        invoiceCount: projectInvoices.length,
        expenses: expenseTotal,
        expenseCount: projectExpenses.length,
        profit,
        margin,
      };
    });
  }, [projects, invoices, expenses]);

  const filteredData = useMemo(
    () =>
      selectedProjectId === 'all'
        ? projectPLData
        : projectPLData.filter((d) => d.project.id === selectedProjectId),
    [projectPLData, selectedProjectId]
  );

  const totals = useMemo(
    () => ({
      revenue: filteredData.reduce((s, d) => s + d.revenue, 0),
      expenses: filteredData.reduce((s, d) => s + d.expenses, 0),
      profit: filteredData.reduce((s, d) => s + d.profit, 0),
    }),
    [filteredData]
  );

  // Chart data
  const barChartData = useMemo(
    () =>
      filteredData
        .filter((d) => d.revenue > 0 || d.expenses > 0)
        .map((d) => ({
          name: d.project.project_name.length > 15
            ? d.project.project_name.slice(0, 15) + '...'
            : d.project.project_name,
          Revenue: d.revenue,
          Expenses: d.expenses,
          Profit: d.profit,
        })),
    [filteredData]
  );

  const pieData = useMemo(
    () =>
      filteredData
        .filter((d) => d.expenses > 0)
        .map((d) => ({
          name: d.project.project_name,
          value: d.expenses,
        })),
    [filteredData]
  );

  // Export PDF
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Project Profit & Loss Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 28);
    doc.text(`Total Revenue: ${formatINR(totals.revenue)} | Total Expenses: ${formatINR(totals.expenses)} | Net Profit: ${formatINR(totals.profit)}`, 14, 35);

    autoTable(doc, {
      startY: 42,
      head: [['Project', 'Client', 'Revenue', 'Expenses', 'Profit', 'Margin']],
      body: filteredData.map((d) => [
        d.project.project_name,
        d.project.client_name || '-',
        formatINR(d.revenue),
        formatINR(d.expenses),
        formatINR(d.profit),
        `${d.margin.toFixed(1)}%`,
      ]),
      foot: [['Total', '', formatINR(totals.revenue), formatINR(totals.expenses), formatINR(totals.profit), totals.revenue > 0 ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%` : '-']],
    });

    doc.save(`Project_PL_${startDate}_${endDate}.pdf`);
  };

  // Export Excel
  const exportExcel = () => {
    const rows = filteredData.map((d) => ({
      Project: d.project.project_name,
      'Project Code': d.project.project_code || '',
      Client: d.project.client_name || '',
      'Billing Method': d.project.billing_method,
      Revenue: d.revenue,
      'Invoice Count': d.invoiceCount,
      Expenses: d.expenses,
      'Expense Count': d.expenseCount,
      Profit: d.profit,
      'Margin %': Number(d.margin.toFixed(1)),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Project P&L');
    XLSX.writeFile(wb, `Project_PL_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FolderKanban className="h-6 w-6" />
              Project Profit & Loss
            </h1>
            <p className="text-sm text-muted-foreground">
              Revenue vs expenses breakdown per project
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={!filteredData.length}>
            <FileText className="h-4 w-4 mr-1" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filteredData.length}>
            <Download className="h-4 w-4 mr-1" />
            Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <Label>Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.project_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Badge variant="outline" className="text-sm px-3 py-2">
                {filteredData.length} project{filteredData.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Revenue</CardDescription>
                <CardTitle className="text-2xl text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-5 w-5" />
                  {formatINR(totals.revenue)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Expenses</CardDescription>
                <CardTitle className="text-2xl text-red-600 flex items-center gap-1">
                  <TrendingDown className="h-5 w-5" />
                  {formatINR(totals.expenses)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Net Profit</CardDescription>
                <CardTitle className={`text-2xl flex items-center gap-1 ${totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <IndianRupee className="h-5 w-5" />
                  {formatINR(totals.profit)}
                  {totals.revenue > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      ({((totals.profit / totals.revenue) * 100).toFixed(1)}%)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Charts */}
          {barChartData.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Revenue vs Expenses by Project</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatINR(value)} />
                      <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {pieData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Expense Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, percent }) => `${name.slice(0, 12)}${name.length > 12 ? '..' : ''} ${(percent * 100).toFixed(0)}%`}
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatINR(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Project P&L Table */}
          <Card>
            <CardHeader>
              <CardTitle>Project-wise Profit & Loss</CardTitle>
              <CardDescription>
                Revenue is matched from invoices via client name. Expenses are matched via project assignment.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No projects found. Create projects first.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {filteredData.map((d) => (
                        <TableRow key={d.project.id}>
                          <TableCell>
                            <div className="font-medium">{d.project.project_name}</div>
                            {d.project.project_code && (
                              <div className="text-xs text-muted-foreground">{d.project.project_code}</div>
                            )}
                          </TableCell>
                          <TableCell>{d.project.client_name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{d.project.billing_method}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-green-600 font-medium">
                            {formatINR(d.revenue)}
                            {d.invoiceCount > 0 && (
                              <div className="text-xs text-muted-foreground">{d.invoiceCount} inv</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {formatINR(d.expenses)}
                            {d.expenseCount > 0 && (
                              <div className="text-xs text-muted-foreground">{d.expenseCount} exp</div>
                            )}
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${d.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {d.profit >= 0 ? '' : '-'}{formatINR(d.profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {d.revenue > 0 ? (
                              <Badge variant={d.margin >= 0 ? 'default' : 'destructive'} className="text-xs">
                                {d.margin.toFixed(1)}%
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals row */}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={3}>Total</TableCell>
                        <TableCell className="text-right text-green-700">{formatINR(totals.revenue)}</TableCell>
                        <TableCell className="text-right text-red-700">{formatINR(totals.expenses)}</TableCell>
                        <TableCell className={`text-right ${totals.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {totals.profit >= 0 ? '' : '-'}{formatINR(totals.profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          {totals.revenue > 0 ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%` : '-'}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default ProjectProfitLoss;
