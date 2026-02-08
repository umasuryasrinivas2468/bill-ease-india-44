import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useInvoices } from '@/hooks/useInvoices';
import { usePurchaseBills } from '@/hooks/usePurchaseBills';

const CashFlowAnalysis: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: bills = [] } = usePurchaseBills();

  const cashFlowData = React.useMemo(() => {
    const months: Record<string, { month: string; inflow: number; outflow: number; net: number }> = {};
    
    // Process invoices (cash inflow)
    invoices.forEach(invoice => {
      if (invoice.status === 'paid') {
        const date = new Date(invoice.invoice_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthName = date.toLocaleDateString('en', { month: 'short', year: 'numeric' });
        
        if (!months[monthKey]) {
          months[monthKey] = { month: monthName, inflow: 0, outflow: 0, net: 0 };
        }
        months[monthKey].inflow += Number(invoice.total_amount);
      }
    });

    // Process bills (cash outflow)  
    bills.forEach(bill => {
      if (bill.status === 'paid') {
        const date = new Date(bill.bill_date || bill.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthName = date.toLocaleDateString('en', { month: 'short', year: 'numeric' });
        
        if (!months[monthKey]) {
          months[monthKey] = { month: monthName, inflow: 0, outflow: 0, net: 0 };
        }
        months[monthKey].outflow += Number(bill.total_amount);
      }
    });

    // Calculate net cash flow
    Object.keys(months).forEach(key => {
      months[key].net = months[key].inflow - months[key].outflow;
    });

    // Sort by month key (YYYY-MM format)
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }, [invoices, bills]);

  const totalInflow = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.total_amount), 0);
    
  const totalOutflow = bills
    .filter(b => b.status === 'paid')
    .reduce((sum, b) => sum + Number(b.total_amount), 0);
    
  const netCashFlow = totalInflow - totalOutflow;

  const pendingReceivables = invoices
    .filter(i => i.status === 'pending' || i.status === 'overdue')
    .reduce((sum, i) => sum + Number(i.total_amount), 0);
    
  const pendingPayables = bills
    .filter(b => b.status !== 'paid')
    .reduce((sum, b) => sum + Number(b.total_amount), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Inflow</CardDescription>
            <CardTitle className="text-2xl text-green-600">₹{totalInflow.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">From paid invoices</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Outflow</CardDescription>
            <CardTitle className="text-2xl text-red-600">₹{totalOutflow.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">From paid bills</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net Cash Flow</CardDescription>
            <CardTitle className={`text-2xl ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{netCashFlow.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Inflow - Outflow</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Net</CardDescription>
            <CardTitle className="text-2xl text-blue-600">
              ₹{(pendingReceivables - pendingPayables).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Future cash flow</p>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Cash Flow Trend</CardTitle>
          <CardDescription>Track your cash inflow, outflow, and net position over time</CardDescription>
        </CardHeader>
        <CardContent>
          {cashFlowData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`} />
                <Tooltip 
                  formatter={(value: any, name: any) => [
                    `₹${Number(value).toLocaleString()}`,
                    name === 'inflow' ? 'Cash Inflow' : 
                    name === 'outflow' ? 'Cash Outflow' : 'Net Cash Flow'
                  ]}
                />
                <Line type="monotone" dataKey="inflow" stroke="#10b981" strokeWidth={2} name="inflow" />
                <Line type="monotone" dataKey="outflow" stroke="#ef4444" strokeWidth={2} name="outflow" />
                <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={3} name="net" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              No cash flow data available. Record some transactions to see the analysis.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cash Flow Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Cash Flow Comparison</CardTitle>
          <CardDescription>Compare inflows vs outflows by month</CardDescription>
        </CardHeader>
        <CardContent>
          {cashFlowData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`} />
                <Tooltip 
                  formatter={(value: any, name: any) => [
                    `₹${Number(value).toLocaleString()}`,
                    name === 'inflow' ? 'Cash Inflow' : 'Cash Outflow'
                  ]}
                />
                <Bar dataKey="inflow" fill="#10b981" name="inflow" />
                <Bar dataKey="outflow" fill="#ef4444" name="outflow" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No data available for comparison chart.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pending Receivables</CardTitle>
            <CardDescription>Money expected from customers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 mb-2">
              ₹{pendingReceivables.toLocaleString()}
            </div>
            <p className="text-sm text-muted-foreground">
              {invoices.filter(i => i.status === 'pending' || i.status === 'overdue').length} pending invoices
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Pending Payables</CardTitle>
            <CardDescription>Money to be paid to vendors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 mb-2">
              ₹{pendingPayables.toLocaleString()}
            </div>
            <p className="text-sm text-muted-foreground">
              {bills.filter(b => b.status !== 'paid').length} pending bills
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CashFlowAnalysis;