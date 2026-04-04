import React, { useMemo, useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInventory } from '@/hooks/useInventory';
import { Sparkles, AlertTriangle, Package, IndianRupee, Bot } from 'lucide-react';

const GEMINI_API_KEY = 'AIzaSyBTQPbSpcSt7xlcXUGbgxiLQqmsmLItA8o';

type InsightsResponse = {
  insights: string;
  stats: {
    totalItems: number;
    goods: number;
    services: number;
    lowStock: number;
    outOfStock: number;
    totalValue: number;
  };
};

function formatSimpleMarkdown(text: string) {
  return text.split('\n').map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={index} className="h-2" />;
    if (trimmed.startsWith('## ')) return <h3 key={index} className="mt-4 text-base font-semibold">{trimmed.replace('## ', '')}</h3>;
    if (trimmed.startsWith('- ')) return <li key={index} className="ml-5 list-disc">{trimmed.slice(2)}</li>;
    return <p key={index} className="text-sm leading-6 text-muted-foreground">{trimmed}</p>;
  });
}

function buildInventoryPrompt(inventory: any[]) {
  const goods = inventory.filter(item => item.type === 'goods');
  const services = inventory.filter(item => item.type === 'services');
  const lowStock = goods.filter(item => Number(item.stock_quantity || 0) <= Number(item.reorder_level || 0));
  const outOfStock = goods.filter(item => Number(item.stock_quantity || 0) === 0);
  const totalValue = goods.reduce((sum, item) => sum + (Number(item.purchase_price || 0) * Number(item.stock_quantity || 0)), 0);

  const compactInventory = inventory.slice(0, 100).map(item => ({
    product_name: item.product_name,
    sku: item.sku,
    category: item.category,
    type: item.type,
    purchase_price: item.purchase_price,
    selling_price: item.selling_price,
    stock_quantity: item.stock_quantity,
    reorder_level: item.reorder_level,
    supplier_name: item.supplier_name,
  }));

  return [
    'You are an expert inventory analyst for an Indian SMB.',
    'Review the inventory snapshot and return practical business insights.',
    'Keep the answer concise, structured, and action-oriented.',
    'Return markdown with these exact sections:',
    '## Summary',
    '## Risks',
    '## Opportunities',
    '## Recommended Actions',
    '## Priority Products',
    '',
    'Business metrics:',
    `- Total items: ${inventory.length}`,
    `- Goods: ${goods.length}`,
    `- Services: ${services.length}`,
    `- Low stock items: ${lowStock.length}`,
    `- Out of stock items: ${outOfStock.length}`,
    `- Estimated inventory value at cost: ₹${totalValue.toFixed(2)}`,
    '',
    'Inventory snapshot JSON:',
    JSON.stringify(compactInventory),
  ].join('\n');
}

const InventoryInsights = () => {
  const { data: inventory = [], isLoading } = useInventory();
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InsightsResponse | null>(null);

  const localStats = useMemo(() => {
    const goods = inventory.filter(item => item.type === 'goods');
    const services = inventory.filter(item => item.type === 'services');
    const lowStock = goods.filter(item => Number(item.stock_quantity || 0) <= Number(item.reorder_level || 0));
    const totalValue = goods.reduce((sum, item) => sum + (Number(item.purchase_price || 0) * Number(item.stock_quantity || 0)), 0);
    return {
      totalItems: inventory.length,
      goods: goods.length,
      services: services.length,
      lowStock: lowStock.length,
      totalValue,
    };
  }, [inventory]);

  const generateInsights = async () => {
    setLoadingInsights(true);
    setError(null);

    try {
      const prompt = buildInventoryPrompt(inventory);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            topP: 0.9,
            maxOutputTokens: 1200,
          },
        }),
      });

      const raw = await response.text();
      let payload: any = null;

      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          throw new Error(response.ok ? 'Gemini returned an invalid response.' : `Gemini request failed (${response.status}).`);
        }
      }

      if (!payload) {
        throw new Error('Gemini returned an empty response.');
      }

      if (!response.ok) {
        throw new Error(payload.error?.message || payload.details || `Failed to generate insights (${response.status})`);
      }

      const insights =
        payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('\n').trim() || '';

      if (!insights) {
        throw new Error('Gemini did not return any insight text.');
      }

      setResult({
        insights,
        stats: {
          totalItems: localStats.totalItems,
          goods: localStats.goods,
          services: localStats.services,
          lowStock: localStats.lowStock,
          outOfStock: inventory.filter(item => item.type === 'goods' && Number(item.stock_quantity || 0) === 0).length,
          totalValue: localStats.totalValue,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate insights');
    } finally {
      setLoadingInsights(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Inventory Insights</h1>
            <p className="text-muted-foreground">AI suggestions for stock risk, pricing, and reorder priorities</p>
          </div>
        </div>
        <Button onClick={generateInsights} disabled={loadingInsights || isLoading || inventory.length === 0}>
          <Sparkles className="mr-2 h-4 w-4" />
          {loadingInsights ? 'Generating...' : 'Generate AI Insights'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Items</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Package className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold">{localStats.totalItems}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Goods</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{localStats.goods}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Low Stock</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="text-2xl font-bold">{localStats.lowStock}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Inventory Value</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <IndianRupee className="h-5 w-5 text-emerald-600" />
            <span className="text-2xl font-bold">{localStats.totalValue.toFixed(0)}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Gemini Inventory Analyst
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading inventory data...</p>}
          {!isLoading && inventory.length === 0 && (
            <p className="text-sm text-muted-foreground">Add inventory items first to generate insights.</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!result && !error && !loadingInsights && inventory.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Generate insights to get AI-backed reorder priorities, pricing observations, and stock risk analysis.
            </p>
          )}
          {loadingInsights && <p className="text-sm text-muted-foreground">Gemini is analyzing your inventory...</p>}
          {result && (
            <div className="space-y-2">
              {formatSimpleMarkdown(result.insights)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryInsights;
