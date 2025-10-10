import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Filter, Download, TrendingUp, Receipt, CreditCard, Wallet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExpenses, useExpenseStats } from '@/hooks/useExpenses';
import { ExpenseFilters } from '@/types/expenses';
import ExpensesList from '@/components/expenses/ExpensesList';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import ExpenseStats from '@/components/expenses/ExpenseStats';
import ExpenseFiltersComponent from '@/components/expenses/ExpenseFilters';
import ExpenseChart from '@/components/expenses/ExpenseChart';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const Expenses = () => {
  const { toast } = useToast();
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  
  const { data: expenses = [], isLoading } = useExpenses(filters);
  const { data: stats } = useExpenseStats(filters);

  const handleFiltersChange = (newFilters: ExpenseFilters) => {
    setFilters(newFilters);
    setIsFiltersOpen(false);
  };

  const clearFilters = () => {
    setFilters({});
  };

  const exportExpenses = () => {
    if (expenses.length === 0) {
      toast({
        title: "No Data",
        description: "No expenses available to export.",
        variant: "destructive",
      });
      return;
    }

    const csvHeaders = [
      'Expense Number',
      'Date',
      'Vendor',
      'Category',
      'Description',
      'Amount',
      'Tax Amount',
      'Total Amount',
      'Payment Mode',
      'Reference Number',
      'Bill Number',
      'Status'
    ];

    const csvData = expenses.map(expense => [
      expense.expense_number,
      expense.expense_date,
      expense.vendor_name,
      expense.category_name,
      expense.description,
      Number(expense.amount).toFixed(2),
      Number(expense.tax_amount).toFixed(2),
      Number(expense.total_amount).toFixed(2),
      expense.payment_mode.toUpperCase(),
      expense.reference_number || '',
      expense.bill_number || '',
      expense.status.toUpperCase()
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const currentDate = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `Expenses_Report_${currentDate}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Export Successful",
      description: "Expenses report has been downloaded successfully.",
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== undefined && value !== '');

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold">Expense Management</h1>
          <p className="text-muted-foreground">Record business expenses and track spending patterns</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFiltersOpen(true)}
            className={hasActiveFilters ? "border-primary" : ""}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1">•</span>}
          </Button>
          <Button variant="outline" size="sm" onClick={exportExpenses}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Expense</DialogTitle>
              </DialogHeader>
              <ExpenseForm onSuccess={() => setIsCreateDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Total Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalExpenses}</div>
              <p className="text-xs text-muted-foreground">
                This month: {stats.monthlyExpenses}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats.totalAmount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                This month: ₹{stats.monthlyAmount.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Tax Amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats.totalTaxAmount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                GST & other taxes
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Top Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-bold">
                {stats.categoryBreakdown[0]?.category_name || 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">
                ₹{stats.categoryBreakdown[0]?.total_amount?.toLocaleString() || '0'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="list" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="list">Expense List</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-6">
          {hasActiveFilters && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Filters applied: {Object.entries(filters).filter(([_, value]) => value).length}
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          <ExpensesList 
            expenses={expenses} 
            isLoading={isLoading}
            onRefresh={() => window.location.reload()}
          />
        </TabsContent>

        <TabsContent value="analytics">
          <ExpenseStats stats={stats} />
        </TabsContent>

        <TabsContent value="charts">
          <ExpenseChart stats={stats} />
        </TabsContent>
      </Tabs>

      {/* Filters Dialog */}
      <Dialog open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Filter Expenses</DialogTitle>
          </DialogHeader>
          <ExpenseFiltersComponent
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClear={clearFilters}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;