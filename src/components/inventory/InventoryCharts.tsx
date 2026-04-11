import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { InventoryItem } from '@/hooks/useInventory';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface InventoryChartsProps {
  inventory: InventoryItem[];
  type: 'demand' | 'forecast';
}

const InventoryCharts: React.FC<InventoryChartsProps> = ({ inventory, type }) => {
  const goods = useMemo(() => inventory.filter(i => i.type === 'goods'), [inventory]);

  const stockVsReorder = useMemo(() => {
    return goods.map(i => ({
      name: i.product_name.length > 12 ? i.product_name.slice(0, 12) + '…' : i.product_name,
      stock: i.stock_quantity || 0,
      reorder: i.reorder_level || 0,
    }));
  }, [goods]);

  const categoryDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    inventory.forEach(i => {
      map[i.category] = (map[i.category] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [inventory]);

  const marginData = useMemo(() => {
    return goods.map(i => {
      const cost = i.purchase_price || 0;
      const margin = cost > 0 ? ((i.selling_price - cost) / cost) * 100 : 0;
      return {
        name: i.product_name.length > 12 ? i.product_name.slice(0, 12) + '…' : i.product_name,
        margin: parseFloat(margin.toFixed(1)),
      };
    });
  }, [goods]);

  const stockValueByProduct = useMemo(() => {
    return goods.map(i => ({
      name: i.product_name.length > 12 ? i.product_name.slice(0, 12) + '…' : i.product_name,
      value: ((i.purchase_price || 0) * (i.stock_quantity || 0)) / 1000,
    })).sort((a, b) => b.value - a.value);
  }, [goods]);

  const forecastData = useMemo(() => {
    return goods.map(i => {
      const qty = i.stock_quantity || 0;
      const reorder = i.reorder_level || 1;
      const dailyBurn = reorder / 30;
      return {
        name: i.product_name.length > 12 ? i.product_name.slice(0, 12) + '…' : i.product_name,
        current: qty,
        day30: Math.max(0, qty - dailyBurn * 30),
        day60: Math.max(0, qty - dailyBurn * 60),
        day90: Math.max(0, qty - dailyBurn * 90),
      };
    });
  }, [goods]);

  const demandScore = useMemo(() => {
    return goods.slice(0, 6).map(i => {
      const qty = i.stock_quantity || 0;
      const reorder = i.reorder_level || 1;
      const margin = i.purchase_price ? ((i.selling_price - i.purchase_price) / i.purchase_price) * 100 : 0;
      return {
        name: i.product_name.length > 10 ? i.product_name.slice(0, 10) + '…' : i.product_name,
        stockHealth: Math.min(100, (qty / Math.max(reorder, 1)) * 50),
        profitability: Math.min(100, Math.max(0, margin)),
        demand: qty <= reorder ? 90 : qty <= reorder * 2 ? 60 : 30,
      };
    });
  }, [goods]);

  if (goods.length === 0) return null;

  if (type === 'demand') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground">Stock vs Reorder Level</CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stockVsReorder} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="stock" fill="hsl(var(--primary))" name="Current Stock" radius={[2, 2, 0, 0]} />
                <Bar dataKey="reorder" fill="hsl(var(--destructive))" name="Reorder Level" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground">Category Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={categoryDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {categoryDistribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground">Profit Margin by Product (%)</CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={marginData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="margin" name="Margin %" radius={[2, 2, 0, 0]}>
                  {marginData.map((entry, i) => (
                    <Cell key={i} fill={entry.margin < 0 ? 'hsl(var(--destructive))' : entry.margin < 15 ? '#f59e0b' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground">Demand Radar (Top 6)</CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={demandScore} cx="50%" cy="50%" outerRadius={65}>
                <PolarGrid />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 9 }} />
                <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                <Radar name="Stock Health" dataKey="stockHealth" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                <Radar name="Demand" dataKey="demand" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.15} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Forecast charts
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs text-muted-foreground">30/60/90 Day Stock Projection</CardTitle>
        </CardHeader>
        <CardContent className="px-1 pb-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={forecastData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="current" fill="hsl(var(--primary))" name="Now" radius={[2, 2, 0, 0]} />
              <Bar dataKey="day30" fill="#f59e0b" name="30 Days" radius={[2, 2, 0, 0]} />
              <Bar dataKey="day60" fill="#f97316" name="60 Days" radius={[2, 2, 0, 0]} />
              <Bar dataKey="day90" fill="hsl(var(--destructive))" name="90 Days" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs text-muted-foreground">Inventory Value by Product (₹K)</CardTitle>
        </CardHeader>
        <CardContent className="px-1 pb-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stockValueByProduct} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis type="number" tick={{ fontSize: 10 }} unit="K" />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
              <Tooltip formatter={(v: number) => `₹${v.toFixed(1)}K`} />
              <Bar dataKey="value" fill="hsl(var(--primary))" name="Value (₹K)" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs text-muted-foreground">Stock Depletion Trend</CardTitle>
        </CardHeader>
        <CardContent className="px-1 pb-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={[
              { period: 'Now', ...Object.fromEntries(goods.slice(0, 5).map(i => [i.product_name.slice(0, 10), i.stock_quantity || 0])) },
              { period: '30d', ...Object.fromEntries(goods.slice(0, 5).map(i => { const q = i.stock_quantity || 0; const r = i.reorder_level || 1; return [i.product_name.slice(0, 10), Math.max(0, q - (r / 30) * 30)]; })) },
              { period: '60d', ...Object.fromEntries(goods.slice(0, 5).map(i => { const q = i.stock_quantity || 0; const r = i.reorder_level || 1; return [i.product_name.slice(0, 10), Math.max(0, q - (r / 30) * 60)]; })) },
              { period: '90d', ...Object.fromEntries(goods.slice(0, 5).map(i => { const q = i.stock_quantity || 0; const r = i.reorder_level || 1; return [i.product_name.slice(0, 10), Math.max(0, q - (r / 30) * 90)]; })) },
            ]} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {goods.slice(0, 5).map((item, i) => (
                <Line key={item.id} type="monotone" dataKey={item.product_name.slice(0, 10)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryCharts;
