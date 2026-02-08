import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ExpenseStats as ExpenseStatsType } from '@/types/expenses';
import { PieChart, BarChart3, TrendingUp, Wallet, Receipt, CreditCard } from 'lucide-react';

interface ExpenseStatsProps {
  stats?: ExpenseStatsType;
}

const ExpenseStats: React.FC<ExpenseStatsProps> = ({ stats }) => {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center h-32">
              <div className="text-muted-foreground">Loading stats...</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalCategoryAmount = stats.categoryBreakdown.reduce((sum, cat) => sum + cat.total_amount, 0);
  const totalPaymentModeAmount = stats.paymentModeBreakdown.reduce((sum, mode) => sum + mode.total_amount, 0);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
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
              Monthly: {stats.monthlyExpenses}
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
              Monthly: ₹{stats.monthlyAmount.toLocaleString()}
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
              {((stats.totalTaxAmount / stats.totalAmount) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Avg Per Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₹{stats.totalExpenses > 0 ? Math.round(stats.totalAmount / stats.totalExpenses).toLocaleString() : '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Average expense amount
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Expenses by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.categoryBreakdown.slice(0, 8).map((category, index) => {
              const percentage = totalCategoryAmount > 0 ? (category.total_amount / totalCategoryAmount) * 100 : 0;
              return (
                <div key={category.category_name} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium truncate">{category.category_name}</span>
                    <div className="text-right">
                      <div className="text-sm font-bold">₹{category.total_amount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{category.count} expense(s)</div>
                    </div>
                  </div>
                  <Progress value={percentage} className="h-2" />
                  <div className="text-xs text-muted-foreground text-right">
                    {percentage.toFixed(1)}%
                  </div>
                </div>
              );
            })}
            {stats.categoryBreakdown.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No category data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Mode Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Payment Modes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.paymentModeBreakdown.map((mode, index) => {
              const percentage = totalPaymentModeAmount > 0 ? (mode.total_amount / totalPaymentModeAmount) * 100 : 0;
              const modeLabels = {
                cash: 'Cash',
                bank: 'Bank Transfer',
                credit_card: 'Credit Card',
                debit_card: 'Debit Card',
                upi: 'UPI',
                cheque: 'Cheque'
              };
              const label = modeLabels[mode.payment_mode as keyof typeof modeLabels] || mode.payment_mode;
              
              return (
                <div key={mode.payment_mode} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{label}</span>
                    <div className="text-right">
                      <div className="text-sm font-bold">₹{mode.total_amount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{mode.count} expense(s)</div>
                    </div>
                  </div>
                  <Progress value={percentage} className="h-2" />
                  <div className="text-xs text-muted-foreground text-right">
                    {percentage.toFixed(1)}%
                  </div>
                </div>
              );
            })}
            {stats.paymentModeBreakdown.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No payment mode data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Monthly Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.monthlyTrend.slice(-12).map((month, index) => {
              const maxAmount = Math.max(...stats.monthlyTrend.map(m => m.total_amount));
              const percentage = maxAmount > 0 ? (month.total_amount / maxAmount) * 100 : 0;
              const monthLabel = new Date(month.month + '-01').toLocaleDateString('en-US', { 
                month: 'short', 
                year: 'numeric' 
              });
              
              return (
                <div key={month.month} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{monthLabel}</span>
                    <div className="text-right">
                      <div className="text-sm font-bold">₹{month.total_amount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{month.count} expense(s)</div>
                    </div>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              );
            })}
            {stats.monthlyTrend.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No monthly trend data available
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpenseStats;