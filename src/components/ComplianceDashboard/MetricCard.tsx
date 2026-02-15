import React from 'react';
import Sparkline from './Sparkline';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';

interface MetricCardProps {
  title: string;
  value: string | number;
  change: number; // percent change (positive/negative)
  trendData?: number[];
  description?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, change, trendData = [], description }) => {
  const positive = change >= 0;
  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-muted-foreground">{title}</div>
          <div className="text-2xl font-bold">{value}</div>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
        <div className="flex flex-col items-end">
          <div className={`text-sm font-medium ${positive ? 'text-green-600' : 'text-red-600'} flex items-center gap-1`}> 
            {positive ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            <span>{Math.abs(change)}%</span>
          </div>
          <div className="mt-2">
            <Sparkline data={trendData} stroke={positive ? '#16a34a' : '#ef4444'} width={100} height={28} />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

export default MetricCard;
