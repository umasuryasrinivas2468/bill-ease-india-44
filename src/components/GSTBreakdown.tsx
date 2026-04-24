import React from 'react';
import { GSTBreakdown as GSTBreakdownData, formatINR } from '@/lib/gst';
import { MapPin, ArrowRightLeft } from 'lucide-react';

interface Props {
  breakdown: GSTBreakdownData;
  sellerState?: string | null;
  buyerState?: string | null;
  className?: string;
  compact?: boolean;
}

const GSTBreakdown: React.FC<Props> = ({
  breakdown,
  sellerState,
  buyerState,
  className = '',
  compact = false,
}) => {
  const { cgst, sgst, igst, total_tax, rate, intraState } = breakdown;

  if (rate === 0) return null;

  return (
    <div className={`space-y-1 text-sm ${className}`}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {intraState ? (
            <>
              <MapPin className="h-3 w-3" />
              <span>
                Intra-state sale ({sellerState || '—'}) — CGST + SGST
              </span>
            </>
          ) : (
            <>
              <ArrowRightLeft className="h-3 w-3" />
              <span>
                Inter-state sale ({sellerState || '—'} → {buyerState || '—'}) — IGST
              </span>
            </>
          )}
        </div>
      )}

      {intraState ? (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CGST ({rate / 2}%)</span>
            <span>{formatINR(cgst)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">SGST ({rate / 2}%)</span>
            <span>{formatINR(sgst)}</span>
          </div>
        </>
      ) : (
        <div className="flex justify-between">
          <span className="text-muted-foreground">IGST ({rate}%)</span>
          <span>{formatINR(igst)}</span>
        </div>
      )}

      {!compact && (
        <div className="flex justify-between font-medium pt-1 border-t">
          <span>Total GST</span>
          <span>{formatINR(total_tax)}</span>
        </div>
      )}
    </div>
  );
};

export default GSTBreakdown;
