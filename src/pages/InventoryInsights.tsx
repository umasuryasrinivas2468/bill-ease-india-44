import React, { useMemo, useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInventory, InventoryItem } from '@/hooks/useInventory';
import { Sparkles, AlertTriangle, Package, IndianRupee, Bot, TrendingUp, BarChart3, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import InventoryCharts from '@/components/inventory/InventoryCharts';

function formatSimpleMarkdown(text: string) {
  return text.split('\n').map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={index} className="h-2" />;
    if (trimmed.startsWith('### ')) return <h4 key={index} className="mt-3 text-sm font-semibold text-foreground">{trimmed.replace('### ', '')}</h4>;
    if (trimmed.startsWith('## ')) return <h3 key={index} className="mt-4 text-base font-semibold text-foreground">{trimmed.replace('## ', '')}</h3>;
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) return <p key={index} className="text-sm font-semibold text-foreground">{trimmed.slice(2, -2)}</p>;
    if (trimmed.startsWith('- **')) {
      const match = trimmed.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
      if (match) return <li key={index} className="ml-5 list-disc text-sm"><span className="font-semibold">{match[1]}</span>{match[2] ? `: ${match[2]}` : ''}</li>;
    }
    if (trimmed.startsWith('- ')) return <li key={index} className="ml-5 list-disc text-sm text-muted-foreground">{trimmed.slice(2)}</li>;
    if (/^\d+\./.test(trimmed)) return <li key={index} className="ml-5 list-decimal text-sm text-muted-foreground">{trimmed.replace(/^\d+\.\s*/, '')}</li>;
    return <p key={index} className="text-sm leading-6 text-muted-foreground">{trimmed}</p>;
  });
}

async function callAI(type: string, metrics: string, inventory: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('inventory-insights', {
    body: { type, metrics, inventory },
  });
  if (error) throw new Error(error.message || 'AI analysis failed');
  if (data?.error) throw new Error(data.error);
  return data?.result || '';
}

function compactItems(inventory: InventoryItem[]) {
  return inventory.slice(0, 80).map(i => ({
    name: i.product_name, sku: i.sku, cat: i.category, type: i.type,
    buy: i.purchase_price, sell: i.selling_price, qty: i.stock_quantity,
    reorder: i.reorder_level, uom: i.uom, supplier: i.supplier_name,
  }));
}

const InventoryInsights = () => {
  const { data: inventory = [], isLoading } = useInventory();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [results, setResults] = useState<Record<string, string>>({});

  const stats = useMemo(() => {
    const goods = inventory.filter(i => i.type === 'goods');
    const lowStock = goods.filter(i => (i.stock_quantity || 0) <= (i.reorder_level || 0));
    const outOfStock = goods.filter(i => (i.stock_quantity || 0) === 0);
    const totalValue = goods.reduce((s, i) => s + (i.purchase_price || 0) * (i.stock_quantity || 0), 0);
    const avgMargin = goods.length ? goods.reduce((s, i) => {
      const cost = i.purchase_price || 0;
      return s + (cost > 0 ? ((i.selling_price - cost) / cost) * 100 : 0);
    }, 0) / goods.length : 0;
    return { total: inventory.length, goods: goods.length, services: inventory.length - goods.length, lowStock: lowStock.length, outOfStock: outOfStock.length, totalValue, avgMargin };
  }, [inventory]);

  const generate = async (type: string) => {
    setLoading(p => ({ ...p, [type]: true }));
    setErrors(p => ({ ...p, [type]: null }));

    const json = JSON.stringify(compactItems(inventory));
    const metricsBlock = `Total items: ${stats.total}, Goods: ${stats.goods}, Services: ${stats.services}, Low stock: ${stats.lowStock}, Out of stock: ${stats.outOfStock}, Value: ₹${stats.totalValue.toFixed(0)}, Avg margin: ${stats.avgMargin.toFixed(1)}%`;

    const prompts: Record<string, string> = {
      overview: [
        'You are an expert inventory analyst for an Indian SMB.',
        'Review the inventory and return concise, actionable insights.',
        'Use markdown with these sections: ## Summary, ## Risks, ## Opportunities, ## Recommended Actions, ## Priority Products',
        `Metrics: ${metricsBlock}`,
        `Inventory: ${json}`,
      ].join('\n'),

      demand: [
        'You are an inventory demand analyst for an Indian SMB.',
        'Based on the inventory data (stock levels, categories, pricing, reorder levels), predict demand patterns.',
        'Use markdown with these sections:',
        '## Demand Analysis',
        '- Identify which products likely have HIGH, MEDIUM, LOW demand based on stock turnover signals',
        '- Group by category',
        '## Seasonal Trends',
        '- Predict which products may see seasonal demand spikes (Indian market context: festivals, monsoon, tax season)',
        '## Demand Alerts',
        '- Flag products where current stock won\'t meet projected demand',
        '- Flag overstocked items with likely low demand',
        '## Recommended Stock Levels',
        '- Suggest optimal stock quantities for top products',
        `Metrics: ${metricsBlock}`,
        `Inventory: ${json}`,
      ].join('\n'),

      forecast: [
        'You are a supply chain forecasting expert for an Indian SMB.',
        'Analyze inventory data and provide a 30/60/90 day forecast.',
        'Use markdown with these sections:',
        '## 30-Day Forecast',
        '- Products likely to run out within 30 days',
        '- Reorder recommendations with quantities',
        '## 60-Day Outlook',
        '- Stock health projection',
        '- Capital requirements for restocking',
        '## 90-Day Strategic View',
        '- Category growth/decline trends',
        '- New product category opportunities',
        '## Cash Flow Impact',
        '- Estimated restocking cost for next 30/60/90 days',
        '- Revenue at risk from stockouts',
        '## Supplier Recommendations',
        '- Which suppliers to prioritize orders with',
        '- Consolidation opportunities',
        `Metrics: ${metricsBlock}`,
        `Inventory: ${json}`,
      ].join('\n'),

      suggestions: [
        'You are an inventory optimization consultant for an Indian SMB.',
        'Provide product-specific actionable suggestions.',
        'Use markdown with these sections:',
        '## Pricing Optimization',
        '- Products where margin is too low (< 15%) — suggest price increase',
        '- Products where margin is very high — consider competitive pricing',
        '- Bundle opportunities',
        '## Product Mix Suggestions',
        '- Categories to expand based on current strength',
        '- Underperforming SKUs to consider discontinuing',
        '- Complementary products to add',
        '## Inventory Efficiency',
        '- Dead stock candidates (high stock + low expected demand)',
        '- Fast movers that need safety stock increase',
        '- ABC analysis: classify products into A (high value), B (medium), C (low)',
        '## Action Items (prioritized)',
        '- Top 5 immediate actions with expected impact',
        `Metrics: ${metricsBlock}`,
        `Inventory: ${json}`,
      ].join('\n'),
    };

    try {
      const text = await callAI(type, metricsBlock, json);
      if (!text) throw new Error('No insights returned.');
      setResults(p => ({ ...p, [type]: text }));
    } catch (err) {
      setErrors(p => ({ ...p, [type]: err instanceof Error ? err.message : 'Failed' }));
    } finally {
      setLoading(p => ({ ...p, [type]: false }));
    }
  };

  const tabConfig = [
    { key: 'overview', label: 'Overview', icon: Bot, desc: 'General inventory health and risk analysis' },
    { key: 'demand', label: 'Demand', icon: BarChart3, desc: 'Demand patterns, seasonal trends, and alerts' },
    { key: 'forecast', label: 'Forecast', icon: TrendingUp, desc: '30/60/90 day stock forecast and cash flow impact' },
    { key: 'suggestions', label: 'Suggestions', icon: Target, desc: 'Product-specific pricing, mix, and efficiency tips' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Inventory Insights</h1>
            <p className="text-muted-foreground">AI-powered demand analysis, forecasting &amp; optimization</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: 'Items', value: stats.total, icon: Package, color: 'text-primary' },
          { label: 'Goods', value: stats.goods, icon: Package, color: 'text-primary' },
          { label: 'Low Stock', value: stats.lowStock, icon: AlertTriangle, color: 'text-amber-500' },
          { label: 'Out of Stock', value: stats.outOfStock, icon: AlertTriangle, color: 'text-destructive' },
          { label: 'Inv. Value', value: `₹${(stats.totalValue / 1000).toFixed(1)}K`, icon: IndianRupee, color: 'text-emerald-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-xs text-muted-foreground">{s.label}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2 px-3 pb-3">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xl font-bold">{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full">
          {tabConfig.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="flex items-center gap-1.5 text-xs md:text-sm">
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabConfig.map(t => (
          <TabsContent key={t.key} value={t.key}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <t.icon className="h-5 w-5" /> {t.label} Analysis
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                </div>
                <Button size="sm" onClick={() => generate(t.key)} disabled={loading[t.key] || isLoading || inventory.length === 0}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {loading[t.key] ? 'Analyzing...' : results[t.key] ? 'Refresh' : 'Generate'}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {(t.key === 'demand' || t.key === 'forecast') && inventory.length > 0 && (
                  <InventoryCharts inventory={inventory} type={t.key} />
                )}
                {isLoading && <p className="text-sm text-muted-foreground">Loading inventory…</p>}
                {!isLoading && inventory.length === 0 && <p className="text-sm text-muted-foreground">Add inventory items first.</p>}
                {errors[t.key] && <p className="text-sm text-destructive">{errors[t.key]}</p>}
                {loading[t.key] && <p className="text-sm text-muted-foreground animate-pulse">AI is analyzing your inventory…</p>}
                {!results[t.key] && !errors[t.key] && !loading[t.key] && inventory.length > 0 && (
                  <p className="text-sm text-muted-foreground">Click "Generate" to get AI-powered {t.label.toLowerCase()} insights.</p>
                )}
                {results[t.key] && <div className="space-y-1">{formatSimpleMarkdown(results[t.key])}</div>}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default InventoryInsights;
