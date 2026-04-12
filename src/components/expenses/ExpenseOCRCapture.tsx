import React, { useMemo, useState } from "react";
import { AlertCircle, Brain, FileImage, Loader2, ScanLine, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ExpenseOCRResult } from "@/utils/expenseOCR";
import { extractExpenseWithGemini } from "@/utils/geminiOCR";
import { CreateExpenseData } from "@/types/expenses";

interface ExpenseOCRCaptureProps {
  onCreateDraft: (draft: Partial<CreateExpenseData> & { expense_date?: string }) => void;
}

const RUPEE_SYMBOL = "\u20B9";

const confidenceColorMap = {
  high: "default" as const,
  medium: "secondary" as const,
  low: "outline" as const,
};

const formatRupee = (value?: string) =>
  value ? `${RUPEE_SYMBOL}${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "N/A";

const ExpenseOCRCapture: React.FC<ExpenseOCRCaptureProps> = ({ onCreateDraft }) => {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<ExpenseOCRResult | null>(null);

  const extractedFields = useMemo(() => {
    if (!ocrResult) return [];

    return [
      { label: "Vendor", field: ocrResult.vendorName },
      { label: "Bill Number", field: ocrResult.billNumber },
      { label: "Expense Date", field: ocrResult.expenseDate },
      { label: "Base Amount", field: ocrResult.amount },
      { label: "Tax Amount", field: ocrResult.taxAmount },
      { label: "Total Amount", field: ocrResult.totalAmount },
      { label: "GSTIN", field: ocrResult.gstNumber },
      { label: "Payment Mode", field: ocrResult.paymentMode },
      { label: "Category Hint", field: ocrResult.categoryHint },
    ].filter((item) => item.field);
  }, [ocrResult]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] || null);
    setOcrResult(null);
  };

  const runOCR = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    try {
      const result = await extractExpenseWithGemini(selectedFile);
      setOcrResult(result);

      toast({
        title: "AI extraction completed",
        description: "Gemini AI has analyzed your document and extracted the expense fields.",
      });
    } catch (error) {
      console.error("Gemini OCR error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Extraction failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateDraft = () => {
    if (!ocrResult) return;

    const total = ocrResult.totalAmount?.value || ocrResult.amount?.value || "0";
    const tax = ocrResult.taxAmount?.value || "0";
    const baseAmount =
      ocrResult.amount?.value ||
      (Number(total) - Number(tax) > 0 ? (Number(total) - Number(tax)).toFixed(2) : total);

    onCreateDraft({
      vendor_name: ocrResult.vendorName?.value || "Scanned Vendor",
      expense_date: ocrResult.expenseDate?.value || new Date().toISOString().split("T")[0],
      category_name: ocrResult.categoryHint?.value || "Miscellaneous",
      description: ocrResult.vendorName?.value
        ? `OCR captured expense from ${ocrResult.vendorName.value}`
        : "OCR captured expense",
      amount: Number(baseAmount),
      tax_amount: Number(tax),
      payment_mode: (ocrResult.paymentMode?.value as CreateExpenseData["payment_mode"]) || "bank",
      bill_number: ocrResult.billNumber?.value,
      notes: [ocrResult.notes, `Created from ${selectedFile?.name || "OCR capture"}`].filter(Boolean).join(" | "),
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-white">Expense OCR Capture</CardTitle>
              <CardDescription className="text-slate-200">
                Upload receipt images or PDFs, extract likely fields, then convert them into an expense draft.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <FileImage className="h-4 w-4" />
                Upload receipt image or PDF
              </div>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange} />
              <p className="mt-3 text-xs text-slate-300">
                Powered by Google Gemini AI. Upload a clear photo or PDF of your bill/invoice for accurate extraction.
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  onClick={runOCR}
                  disabled={!selectedFile || isProcessing}
                  className="bg-white text-slate-900 hover:bg-slate-100"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      AI is analyzing...
                    </>
                  ) : (
                    <>
                      <ScanLine className="mr-2 h-4 w-4" />
                      Extract with Gemini AI
                    </>
                  )}
                </Button>
                {ocrResult && (
                  <Button type="button" variant="secondary" onClick={handleCreateDraft}>
                    <WandSparkles className="mr-2 h-4 w-4" />
                    Create Expense Draft
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <div className="mb-2 text-sm font-semibold">Gemini AI extracts</div>
              <ul className="space-y-2 text-sm text-slate-100">
                <li>Vendor name and bill number</li>
                <li>Expense date and GST number</li>
                <li>Base amount, tax amount, and total</li>
                <li>Payment mode and category hint</li>
                <li>Raw extracted text for manual review</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {ocrResult && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Fields</CardTitle>
              <CardDescription>Review confidence before converting to an expense.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {extractedFields.map((item) => (
                  <div key={item.label} className="rounded-xl border p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                      <Badge variant={confidenceColorMap[item.field!.confidence]}>
                        {item.field!.confidence}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold">
                      {item.label.toLowerCase().includes("amount") ? formatRupee(item.field?.value) : item.field?.value}
                    </p>
                  </div>
                ))}
              </div>

              {!ocrResult.vendorName && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Manual review recommended</AlertTitle>
                  <AlertDescription>
                    Vendor name was not confidently detected. The draft will still open so you can correct it.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Extracted Text</CardTitle>
              <CardDescription>Use this when a field needs manual correction.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={ocrResult.rawText} readOnly className="min-h-[360px] resize-none font-mono text-xs" />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ExpenseOCRCapture;
