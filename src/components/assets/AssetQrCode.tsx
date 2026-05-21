import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Printer, QrCode as QrIcon } from 'lucide-react';

/**
 * Generates a QR code for an asset (Module 19).
 *
 * The QR payload is intentionally simple: the asset_code as a string. When
 * scanned by the audit-verification screen (Module 5), it looks up the asset
 * by code via the asset-code search field on AuditSession.
 *
 * If you want richer payloads in future (e.g. JSON with asset_id + URL),
 * just change the `payload` here — verifyByCode will still match on the
 * asset_code field via .or() lookup.
 */
interface Props {
  assetCode: string;
  assetName: string;
  assetId?: string;
  /** Render only the small inline button; the dialog opens on click. */
  compact?: boolean;
}

const AssetQrCode: React.FC<Props> = ({ assetCode, assetName, assetId, compact }) => {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string>('');
  const [labelCount, setLabelCount] = useState(1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toDataURL(assetCode, { margin: 1, width: 320 })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [open, assetCode]);

  const downloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${assetCode}-qr.png`;
    a.click();
  };

  const print = () => {
    if (!dataUrl) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const labels = Array.from({ length: labelCount }, () => `
      <div style="display:inline-block;width:48mm;height:30mm;border:1px solid #ccc;margin:1mm;padding:2mm;text-align:center;vertical-align:top;font-family:sans-serif;">
        <img src="${dataUrl}" style="width:22mm;height:22mm;" />
        <div style="font-size:10px;font-weight:600;margin-top:1mm;">${assetCode}</div>
        <div style="font-size:8px;color:#555;line-height:1.1;max-height:18px;overflow:hidden;">${assetName}</div>
      </div>
    `).join('');
    win.document.write(`
      <!doctype html><html><head><title>${assetCode} QR Labels</title>
      <style>@page{margin:5mm;} body{margin:0;padding:5mm;}</style>
      </head><body>${labels}</body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 250);
  };

  const button = compact ? (
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
      <QrIcon className="h-3.5 w-3.5 mr-1" /> QR
    </Button>
  ) : (
    <Button variant="outline" onClick={() => setOpen(true)}>
      <QrIcon className="h-4 w-4 mr-2" /> Asset QR code
    </Button>
  );

  return (
    <>
      {button}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asset QR code — {assetCode}</DialogTitle>
          </DialogHeader>
          <Card>
            <CardContent className="pt-5 flex flex-col items-center gap-3">
              {dataUrl ? (
                <img src={dataUrl} alt={`QR for ${assetCode}`} className="w-64 h-64" />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center text-xs text-muted-foreground">Generating…</div>
              )}
              <div className="text-center">
                <div className="font-mono text-sm font-semibold">{assetCode}</div>
                <div className="text-xs text-muted-foreground max-w-xs truncate">{assetName}</div>
              </div>
              <div className="text-xs text-muted-foreground text-center">
                Scan this from the asset-audit session to verify the asset's location, custodian and condition.
              </div>
            </CardContent>
          </Card>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Labels to print</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={labelCount}
                onChange={(e) => setLabelCount(Math.max(1, Math.min(50, Number(e.target.value))))}
              />
            </div>
            <Button variant="outline" onClick={print} disabled={!dataUrl}>
              <Printer className="h-4 w-4 mr-1" /> Print labels
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={downloadPng} disabled={!dataUrl}>
              <Download className="h-4 w-4 mr-1" /> Download PNG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AssetQrCode;
