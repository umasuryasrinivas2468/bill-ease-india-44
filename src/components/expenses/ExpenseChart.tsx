import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExpenseStats } from '@/types/expenses';
import { BarChart3, PieChart, TrendingUp, Calendar } from 'lucide-react';

interface ExpenseChartProps {
  stats?: ExpenseStats;
}

const ExpenseChart: React.FC<ExpenseChartProps> = ({ stats }) => {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center h-32">
              <div className="text-muted-foreground">Loading charts...</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate chart data
  const maxCategoryAmount = Math.max(...stats.categoryBreakdown.map(cat => cat.total_amount), 1);
  const maxMonthlyAmount = Math.max(...stats.monthlyTrend.map(month => month.total_amount), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Expenses by Category (Bar Chart)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.categoryBreakdown.slice(0, 8).map((category, index) => {
                const percentage = (category.total_amount / maxCategoryAmount) * 100;
                const colors = [
                  'bg-blue-500',
                  'bg-green-500',
                  'bg-yellow-500',
                  'bg-red-500',
                  'bg-purple-500',
                  'bg-pink-500',
                  'bg-indigo-500',
                  'bg-orange-500'
                ];
                const color = colors[index % colors.length];
                
                return (
                  <div key={category.category_name} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium truncate">{category.category_name}</span>
                      <span className="text-muted-foreground">₹{category.total_amount.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
                      <div
                        className={`h-3 rounded-full ${color} transition-all duration-500 ease-out`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                      {category.count} expense(s) • {((category.total_amount / stats.totalAmount) * 100).toFixed(1)}%
                    </div>
                  </div>
                );
              })}
              {stats.categoryBreakdown.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No category data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment Mode Pie Chart (Visual Representation) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Payment Modes Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.paymentModeBreakdown.map((mode, index) => {
                const percentage = (mode.total_amount / stats.totalAmount) * 100;
                const modeLabels = {
                  cash: 'Cash',
                  bank: 'Bank Transfer',
                  credit_card: 'Credit Card',
                  debit_card: 'Debit Card',
                  upi: 'UPI',
                  cheque: 'Cheque'
                };
                const label = modeLabels[mode.payment_mode as keyof typeof modeLabels] || mode.payment_mode;
                const colors = [
                  'bg-emerald-500',
                  'bg-cyan-500',
                  'bg-violet-500',
                  'bg-rose-500',
                  'bg-amber-500',
                  'bg-teal-500'
                ];
                const color = colors[index % colors.length];
                
                return (
                  <div key={mode.payment_mode} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full ${color}`}></div>
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">₹{mode.total_amount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">
                        {percentage.toFixed(1)}% • {mode.count} expense(s)
                      </div>
                    </div>
                  </div>
                );
              })}
              {stats.paymentModeBreakdown.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No payment mode data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Monthly Expense Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Chart Area */}
            <div className="relative h-48 flex items-end justify-between gap-2">
              {stats.monthlyTrend.slice(-12).map((month, index) => {
                const height = (month.total_amount / maxMonthlyAmount) * 100;
                const monthLabel = new Date(month.month + '-01').toLocaleDateString('en-US', { 
                  month: 'short'
                });
                
                return (
                  <div key={month.month} className="flex-1 flex flex-col items-center gap-2">
                    <div className="relative group">
                      <div
                        className="w-full bg-blue-500 rounded-t transition-all duration-500 ease-out hover:bg-blue-600 min-h-[4px]"
                        style={{ height: `${Math.max(height, 2)}%` }}
                      ></div>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                        ₹{month.total_amount.toLocaleString()}
                        <div className="text-xs">{month.count} expenses</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-center">
                      {monthLabel}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-sm">
              {stats.monthlyTrend.slice(-6).map((month) => {
                const monthLabel = new Date(month.month + '-01').toLocaleDateString('en-US', { 
                  month: 'short',
                  year: 'numeric'
                });
                
                return (
                  <div key={month.month} className="text-center">
                    <div className="font-medium">₹{month.total_amount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{monthLabel}</div>
                    <div className="text-xs text-muted-foreground">{month.count} expenses</div>
                  </div>
                );
              })}
            </div>

            {stats.monthlyTrend.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No monthly trend data available
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Expense Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalExpenses}</div>
              <div className="text-sm text-muted-foreground">Total Expenses</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">₹{stats.totalAmount.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Amount</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">₹{stats.totalTaxAmount.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Tax</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                ₹{stats.totalExpenses > 0 ? Math.round(stats.totalAmount / stats.totalExpenses).toLocaleString() : '0'}
              </div>
              <div className="text-sm text-muted-foreground">Average per Expense</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpenseChart;