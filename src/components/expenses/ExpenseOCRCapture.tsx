import React, { useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { AlertCircle, Brain, Boxes, CheckCircle2, FileImage, FileText, KeyRound, Link2, Loader2, Package, ScanLine, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ExpenseOCRResult, OCRItemLine } from "@/utils/expenseOCR";
import { extractExpenseWithGemini } from "@/utils/geminiOCR";
import {
  applyInventoryAutomation,
  AutomationResult,
  ensureVendorForOcr,
  hasGoodsTextSignals,
  parseItemsFromRawText,
  shouldAutoCreateInventory,
} from "@/utils/expenseInventoryAutomation";
import { CreateExpenseData } from "@/types/expenses";
import { matchInvoiceToPO, POMatchResult } from "@/lib/poMatcher";
import { createExpenseWithLiabilities } from "@/lib/vendorLiabilityWriter";

interface ExpenseOCRCaptureProps {
  onCreateDraft: (draft: Partial<CreateExpenseData> & { expense_date?: string }) => void;
}

const GEMINI_API_KEY_STORAGE_KEY = "billease_gemini_api_key";

const RUPEE_SYMBOL = "\u20B9";

const confidenceColorMap = {
  high: "default" as const,
  medium: "secondary" as const,
  low: "outline" as const,
};

const formatRupee = (value?: string) =>
  value ? `${RUPEE_SYMBOL}${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "N/A";

const DEFAULT_GEMINI_API_KEY = "apikeygemini";

const getSavedApiKey = (): string =>
  localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || import.meta.env.VITE_GEMINI_API_KEY || DEFAULT_GEMINI_API_KEY;

const saveApiKey = (key: string) => {
  if (key) {
    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
  } else {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  }
};

const ExpenseOCRCapture: React.FC<ExpenseOCRCaptureProps> = ({ onCreateDraft }) => {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<ExpenseOCRResult | null>(null);
  const [apiKey, setApiKey] = useState<string>(getSavedApiKey);
  const [showApiKeyInput, setShowApiKeyInput] = useState(!getSavedApiKey());
  const [parsedItems, setParsedItems] = useState<OCRItemLine[]>([]);
  const [inventoryResult, setInventoryResult] = useState<AutomationResult | null>(null);
  const [isPostingInventory, setIsPostingInventory] = useState(false);
  const [poMatch, setPoMatch] = useState<POMatchResult | null>(null);
  const [isMatchingPO, setIsMatchingPO] = useState(false);
  const [isSavingLiability, setIsSavingLiability] = useState(false);
  const [liabilitySaved, setLiabilitySaved] = useState(false);

  const extractedFields = useMemo(() => {
    if (!ocrResult) return [];

    return [
      { label: "Vendor", field: ocrResult.vendorName },
      { label: "Bill Number", field: ocrResult.billNumber },
      { label: "PO Number", field: ocrResult.poNumber },
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
    setParsedItems([]);
    setInventoryResult(null);
    setPoMatch(null);
    setLiabilitySaved(false);
  };

  const inventoryAutoDetected = useMemo(() => shouldAutoCreateInventory(ocrResult), [ocrResult]);
  const rawTextHasGoodsSignals = useMemo(
    () => (ocrResult?.rawText ? hasGoodsTextSignals(ocrResult.rawText) : false),
    [ocrResult?.rawText],
  );
  const looksLikeGoodsBill = inventoryAutoDetected || rawTextHasGoodsSignals || parsedItems.length > 0;

  const handleSaveApiKey = () => {
    saveApiKey(apiKey.trim());
    setShowApiKeyInput(false);
    toast({ title: "API key saved", description: "Your Aczen AI API key has been saved locally." });
  };

  const runOCR = async () => {
    if (!selectedFile) return;

    const key = apiKey.trim();
    if (!key) {
      toast({
        title: "API key required",
          description: "Please enter your Aczen AI API key to extract expense data.",
        variant: "destructive",
      });
      setShowApiKeyInput(true);
      return;
    }

    setIsProcessing(true);
    setInventoryResult(null);
    setPoMatch(null);
    setLiabilitySaved(false);
    try {
      const result = await extractExpenseWithGemini(selectedFile, key);
      setOcrResult(result);

      // Extract items: AI-detected first; fall back to raw-text parsing when
      // the bill looks tabular but the model returned no items[].
      let items: OCRItemLine[] = result.items ? result.items.map((it) => ({ ...it })) : [];
      if (items.length === 0 && hasGoodsTextSignals(result.rawText || "")) {
        items = parseItemsFromRawText(result.rawText || "");
      }
      setParsedItems(items);

      // Try to match this invoice to an open Purchase Order. Runs in parallel
      // with inventory automation; result is non-blocking and only drives the
      // "Save with PO link" UI affordance below.
      if (user?.id) {
        setIsMatchingPO(true);
        try {
          const matched = await matchInvoiceToPO(user.id, { ...result, items });
          setPoMatch(matched);
        } catch (matchErr) {
          console.warn("PO match failed:", matchErr);
          setPoMatch(null);
        } finally {
          setIsMatchingPO(false);
        }
      }

      // If the bill looks like a goods purchase, push the items straight into
      // inventory: resolve/create the vendor, match-or-create each inventory
      // row, post inward stock movement and the inventory ledger journal.
      const looksGoods = shouldAutoCreateInventory(result) || items.some(it => Number(it.quantity || 0) > 0);
      if (user?.id && looksGoods && items.length > 0) {
        setIsPostingInventory(true);
        try {
          const vendor = await ensureVendorForOcr(
            user.id,
            result.vendorName?.value || null,
            result.gstNumber?.value || null,
          );
          const automation = await applyInventoryAutomation(items, {
            userId: user.id,
            vendorId: vendor?.id || null,
            vendorName: vendor?.name || result.vendorName?.value || null,
            billNumber: result.billNumber?.value || null,
            billDate: result.expenseDate?.value || null,
            categoryHint: result.categoryHint?.value || null,
          });
          setInventoryResult(automation);
          toast({
            title: "Added to Inventory",
            description: `${automation.itemsCreated} new + ${automation.itemsMatched} matched item(s). Stock-on-hand and journal updated.`,
          });
        } catch (autoErr) {
          console.error("Inventory automation failed:", autoErr);
          toast({
            title: "Inventory update failed",
            description: autoErr instanceof Error ? autoErr.message : "Could not add items to inventory.",
            variant: "destructive",
          });
        } finally {
          setIsPostingInventory(false);
        }
      } else {
        toast({
          title: "AI extraction completed",
          description: items.length > 0
            ? `Extracted ${items.length} line item(s).`
            : "Document analyzed — review the extracted fields below.",
        });
      }
    } catch (error) {
      console.error("Aczen OCR error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Extraction failed",
        description: message.includes("API key")
          ? "Invalid Aczen AI API key. Please check and try again."
          : `Could not process the document: ${message}`,
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
      po_id: poMatch?.po?.id,
      po_number: poMatch?.po?.order_number ?? ocrResult.poNumber?.value,
      po_match_status: poMatch?.po
        ? poMatch.confidence === "low"
          ? "conflict"
          : poMatch.remainingOpenLines.some((l) => l.openQty > 0)
          ? "partial"
          : "matched"
        : "unlinked",
      po_match_confidence: poMatch?.po ? poMatch.confidence : undefined,
    });
  };

  const handleSaveWithLiability = async () => {
    if (!ocrResult || !poMatch || !user?.id) return;
    setIsSavingLiability(true);
    try {
      const result = await createExpenseWithLiabilities({
        userId: user.id,
        ocr: { ...ocrResult, items: parsedItems.length > 0 ? parsedItems : ocrResult.items },
        match: poMatch,
      });
      setLiabilitySaved(true);
      const stillOpen = poMatch.remainingOpenLines.some((l) => l.openQty > 0);
      toast({
        title: poMatch.po ? "Vendor liability recorded" : "Direct invoice recorded",
        description: poMatch.po
          ? `Linked to PO ${poMatch.po.order_number}. ${result.liabilityIds.length} liability line(s) created.${
              stillOpen ? " PO still has open quantities." : " PO fully invoiced."
            }`
          : `${result.liabilityIds.length} unlinked liability line(s) created.`,
      });
    } catch (err) {
      console.error("Liability save failed:", err);
      toast({
        title: "Could not record vendor liability",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSavingLiability(false);
    }
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
          {showApiKeyInput && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4" />
                Aczen AI API Key
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Enter your Aczen AI API key..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="border-white/20 bg-white/10 text-white placeholder:text-slate-400"
                />
                <Button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim()}
                  className="bg-amber-500 text-white hover:bg-amber-600"
                >
                  Save
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                Get your free API key from{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-amber-300"
                >
                  Google AI Studio
                </a>
                . Your key is stored locally in your browser.
              </p>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <FileImage className="h-4 w-4" />
                Upload receipt image or PDF
              </div>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange} />
              <p className="mt-3 text-xs text-slate-300">
                Powered by Aczen AI. Upload a clear photo or PDF of your bill/invoice for accurate extraction.
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
                      Extract with Aczen AI
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
              <div className="mb-2 text-sm font-semibold">Aczen AI extracts</div>
              <ul className="space-y-2 text-sm text-slate-100">
                <li>Vendor name and bill number</li>
                <li>Expense date and GST number</li>
                <li>Base amount, tax amount, and total</li>
                <li>Payment mode and category hint</li>
                <li>Raw extracted text for manual review</li>
              </ul>
              {/* Change API Key button removed per request */}
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

      {ocrResult && looksLikeGoodsBill && (
        <Card className={inventoryResult ? 'border-emerald-200 bg-emerald-50/40' : 'border-dashed'}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {inventoryResult ? (
                  <CheckCircle2 className="h-5 w-5 mt-0.5 text-emerald-700" />
                ) : (
                  <Boxes className="h-5 w-5 mt-0.5 text-muted-foreground" />
                )}
                <div>
                  <CardTitle className="text-base">
                    {isPostingInventory
                      ? 'Adding items to inventory…'
                      : inventoryResult
                        ? 'Items added to inventory'
                        : 'Goods purchase detected'}
                  </CardTitle>
                  <CardDescription>
                    {inventoryResult
                      ? `${inventoryResult.itemsCreated} new SKU(s) created · ${inventoryResult.itemsMatched} existing matched · stock & journal updated.`
                      : 'Items will be auto-created in inventory and stock-on-hand will be updated.'}
                  </CardDescription>
                </div>
              </div>
              {inventoryAutoDetected ? (
                <Badge className="bg-emerald-600">
                  <Package className="h-3 w-3 mr-1" />
                  AI-detected goods
                </Badge>
              ) : rawTextHasGoodsSignals ? (
                <Badge variant="outline" className="border-amber-400 text-amber-700">
                  Tabular bill
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPostingInventory ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Posting stock movements and updating the inventory ledger…
              </div>
            ) : inventoryResult && inventoryResult.details.length > 0 ? (
              <div className="rounded-md border bg-white p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {inventoryResult.details.length} item(s) processed · total value {formatRupee(String(inventoryResult.totalValue.toFixed(2)))}
                </p>
                <ul className="text-sm space-y-0.5 max-h-40 overflow-y-auto">
                  {inventoryResult.details.slice(0, 8).map((d, idx) => (
                    <li key={idx} className="flex justify-between gap-3">
                      <span className="truncate">
                        {d.description}
                        <span className={d.was_new ? 'ml-2 text-emerald-700' : 'ml-2 text-muted-foreground'}>
                          ({d.was_new ? 'new' : 'matched'})
                        </span>
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {d.quantity} × {formatRupee(String(d.unit_cost.toFixed(2)))}
                      </span>
                    </li>
                  ))}
                  {inventoryResult.details.length > 8 && (
                    <li className="text-xs text-muted-foreground italic">
                      +{inventoryResult.details.length - 8} more — view in Inventory
                    </li>
                  )}
                </ul>
              </div>
            ) : parsedItems.length > 0 ? (
              <div className="rounded-md border bg-white p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {parsedItems.length} line item(s) detected
                </p>
                <ul className="text-sm space-y-0.5 max-h-40 overflow-y-auto">
                  {parsedItems.slice(0, 8).map((it, idx) => (
                    <li key={idx} className="flex justify-between gap-3">
                      <span className="truncate">
                        {it.description}
                        {it.hsn_sac ? <span className="text-muted-foreground ml-1">({it.hsn_sac})</span> : null}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {it.quantity ?? '?'} {it.unit || ''} {it.amount ? `· ${formatRupee(String(it.amount))}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No line items extracted</AlertTitle>
                <AlertDescription>
                  The bill was identified as a goods purchase but no line items could be parsed.
                  Try a clearer scan, or add items manually via Inventory.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {ocrResult && (isMatchingPO || poMatch) && (
        <Card className={liabilitySaved ? "border-emerald-200 bg-emerald-50/40" : poMatch?.po ? "border-blue-200" : "border-dashed"}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {liabilitySaved ? (
                  <CheckCircle2 className="h-5 w-5 mt-0.5 text-emerald-700" />
                ) : poMatch?.po ? (
                  <Link2 className="h-5 w-5 mt-0.5 text-blue-700" />
                ) : (
                  <FileText className="h-5 w-5 mt-0.5 text-muted-foreground" />
                )}
                <div>
                  <CardTitle className="text-base">
                    {isMatchingPO
                      ? "Searching for matching Purchase Order…"
                      : liabilitySaved
                      ? "Vendor liability recorded"
                      : poMatch?.po
                      ? `Matched to PO ${poMatch.po.order_number}`
                      : "No matching Purchase Order"}
                  </CardTitle>
                  <CardDescription>
                    {liabilitySaved
                      ? "Expense + line-item liabilities saved. Outstanding balance will reduce as payments are recorded."
                      : poMatch?.po
                      ? `Vendor: ${poMatch.po.vendor_name} · PO total ${formatRupee(String(poMatch.po.total_amount))} · ${poMatch.reason.replace(/_/g, " ")}`
                      : poMatch
                      ? "Could not auto-match. Saving will create an unlinked vendor liability for direct invoicing."
                      : "Cross-checking the invoice against your open POs."}
                  </CardDescription>
                </div>
              </div>
              {poMatch?.po && (
                <Badge variant={poMatch.confidence === "high" ? "default" : poMatch.confidence === "medium" ? "secondary" : "outline"}>
                  {poMatch.confidence} confidence
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {poMatch?.po && (
              <div className="rounded-md border bg-white p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Line-by-line match
                </p>
                <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                  {poMatch.lineMatches.map((lm, idx) => (
                    <li key={idx} className="flex justify-between gap-3">
                      <span className="truncate">
                        {lm.invoiceDescription || "(unnamed line)"}
                        {lm.poProductName ? (
                          <span className="ml-2 text-emerald-700">→ {lm.poProductName}</span>
                        ) : (
                          <span className="ml-2 text-amber-700">unmatched</span>
                        )}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        invoiced {lm.invoiceQty}
                        {lm.poRemainingQty != null ? ` / open ${lm.poRemainingQty}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {poMatch.remainingOpenLines.some((l) => l.openQty > 0) && (
                  <Alert className="mt-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Partial delivery</AlertTitle>
                    <AlertDescription>
                      PO will stay open for{" "}
                      {poMatch.remainingOpenLines
                        .filter((l) => l.openQty > 0)
                        .map((l) => `${l.openQty} × ${l.productName}`)
                        .join(", ")}
                      .
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            {!liabilitySaved && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={handleSaveWithLiability}
                  disabled={isSavingLiability || !user?.id}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  {isSavingLiability ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving liability…
                    </>
                  ) : (
                    <>
                      <Link2 className="mr-2 h-4 w-4" />
                      {poMatch?.po ? "Save invoice + link to PO" : "Save as direct invoice"}
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default ExpenseOCRCapture;
