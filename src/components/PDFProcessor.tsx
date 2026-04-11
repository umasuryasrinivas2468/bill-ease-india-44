
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Download, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Tesseract from 'tesseract.js';

interface ExtractedData {
  invoiceNumber?: string;
  date?: string;
  amount?: string;
  gstAmount?: string;
  totalAmount?: string;
  vendorName?: string;
  vendorGST?: string;
  rawText: string;
}

const PDFProcessor: React.FC = () => {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const extractDataFromText = (text: string): ExtractedData => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Common Indian invoice patterns
    const patterns = {
      invoiceNumber: /(?:invoice|bill|receipt)[\s#:]*([a-zA-Z0-9\-\/]+)/i,
      date: /(?:date|dated)[\s:]*(\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{2,4})/i,
      gstNumber: /(?:gstin|gst)[\s:]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1})/i,
      amount: /(?:amount|total|sum)[\s:₹]*([0-9,]+\.?[0-9]*)/i,
      gstAmount: /(?:gst|tax)[\s:₹]*([0-9,]+\.?[0-9]*)/i,
      vendorName: /(?:from|vendor|supplier)[\s:]*([a-zA-Z\s]+)/i,
    };

    const extracted: ExtractedData = {
      rawText: text
    };

    // Extract invoice number
    const invoiceMatch = text.match(patterns.invoiceNumber);
    if (invoiceMatch) {
      extracted.invoiceNumber = invoiceMatch[1];
    }

    // Extract date
    const dateMatch = text.match(patterns.date);
    if (dateMatch) {
      extracted.date = dateMatch[1];
    }

    // Extract GST number
    const gstMatch = text.match(patterns.gstNumber);
    if (gstMatch) {
      extracted.vendorGST = gstMatch[1];
    }

    // Look for amounts in the text
    const amountMatches = text.match(/₹?\s*([0-9,]+\.?[0-9]*)/g);
    if (amountMatches && amountMatches.length > 0) {
      // Try to identify which amount is which
      const amounts = amountMatches.map(match => match.replace(/[₹,\s]/g, ''));
      
      // Usually the largest amount is the total
      const numericAmounts = amounts.map(a => parseFloat(a)).filter(a => !isNaN(a));
      if (numericAmounts.length > 0) {
        extracted.totalAmount = Math.max(...numericAmounts).toString();
        
        // If we have multiple amounts, try to identify GST
        if (numericAmounts.length > 1) {
          const sortedAmounts = numericAmounts.sort((a, b) => b - a);
          extracted.amount = sortedAmounts[0].toString();
          
          // Look for GST percentage mentions
          const gstPercentMatch = text.match(/(\d+)%\s*gst/i);
          if (gstPercentMatch && sortedAmounts.length > 1) {
            const gstPercent = parseInt(gstPercentMatch[1]);
            const possibleBaseAmount = sortedAmounts.find(amount => {
              const calculatedGst = (amount * gstPercent) / 100;
              return sortedAmounts.some(gst => Math.abs(gst - calculatedGst) < 1);
            });
            
            if (possibleBaseAmount) {
              extracted.amount = possibleBaseAmount.toString();
              extracted.gstAmount = ((possibleBaseAmount * gstPercent) / 100).toString();
            }
          }
        }
      }
    }

    // Extract vendor name (first few meaningful words)
    const meaningfulLines = lines.filter(line => 
      line.length > 3 && 
      !line.match(/^\d+$/) && 
      !line.match(/^₹/) &&
      !line.match(/^(invoice|bill|date|gst)/i)
    );
    
    if (meaningfulLines.length > 0) {
      extracted.vendorName = meaningfulLines[0];
    }

    return extracted;
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    
    try {
      if (file.type === 'application/pdf') {
        toast({
          title: "PDF Processing",
          description: "PDF processing will be available soon. Please convert to image format for now.",
          variant: "destructive",
        });
        return;
      }

      // Process image files with OCR
      if (file.type.startsWith('image/')) {
        const { data: { text } } = await Tesseract.recognize(file, 'eng', {
          logger: m => console.log(m)
        });

        const extracted = extractDataFromText(text);
        setExtractedData(prev => [...prev, extracted]);
        
        toast({
          title: "Processing Complete",
          description: "Invoice data has been extracted successfully.",
        });
      } else {
        toast({
          title: "Unsupported Format",
          description: "Please upload PDF or image files only.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Processing Error",
        description: "Failed to process the file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleProcess = () => {
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const downloadCSV = () => {
    if (extractedData.length === 0) {
      toast({
        title: "No Data",
        description: "No extracted data available to download.",
        variant: "destructive",
      });
      return;
    }

    const headers = ['Invoice Number', 'Date', 'Vendor Name', 'Vendor GST', 'Amount', 'GST Amount', 'Total Amount'];
    const csvContent = [
      headers.join(','),
      ...extractedData.map(data => [
        data.invoiceNumber || '',
        data.date || '',
        data.vendorName || '',
        data.vendorGST || '',
        data.amount || '',
        data.gstAmount || '',
        data.totalAmount || ''
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice_data_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Download Complete",
      description: "CSV file has been downloaded successfully.",
    });
  };

  const clearData = () => {
    setExtractedData([]);
    setSelectedFile(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Invoice Data Extractor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file-upload">Upload Invoice (PDF/Image)</Label>
          <Input
            id="file-upload"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif"
            onChange={handleFileSelect}
          />
        </div>
        
        {selectedFile && (
          <div className="flex gap-2">
            <Button 
              onClick={handleProcess} 
              disabled={isProcessing}
              className="flex-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Extract Data
                </>
              )}
            </Button>
          </div>
        )}

        {extractedData.length > 0 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Extracted Data ({extractedData.length} records)</h3>
              <div className="flex gap-2">
                <Button onClick={downloadCSV} size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
                <Button onClick={clearData} variant="outline" size="sm">
                  Clear
                </Button>
              </div>
            </div>
            
            <div className="max-h-60 overflow-y-auto border rounded p-4 space-y-2">
              {extractedData.map((data, index) => (
                <div key={index} className="border-b pb-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {data.invoiceNumber && <div><strong>Invoice:</strong> {data.invoiceNumber}</div>}
                    {data.date && <div><strong>Date:</strong> {data.date}</div>}
                    {data.vendorName && <div><strong>Vendor:</strong> {data.vendorName}</div>}
                    {data.totalAmount && <div><strong>Total:</strong> ₹{data.totalAmount}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PDFProcessor;
