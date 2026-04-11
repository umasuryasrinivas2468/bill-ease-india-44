
import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Download, AlertCircle, CheckCircle, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Tesseract from 'tesseract.js';

interface ExtractedInvoiceData {
  fileName: string;
  invoiceNumber: string;
  clientName: string;
  amount: string;
  gstAmount: string;
  totalAmount: string;
  invoiceDate: string;
  dueDate: string;
  status: 'success' | 'error';
  error?: string;
}

const BulkInvoiceProcessor = () => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<ExtractedInvoiceData[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    const validFiles = selectedFiles.filter(file => 
      file.type === 'application/pdf' || 
      file.type.startsWith('image/')
    );
    
    if (validFiles.length !== selectedFiles.length) {
      toast({
        title: "Invalid Files",
        description: "Only PDF and image files are allowed.",
        variant: "destructive",
      });
    }
    
    setFiles(validFiles);
    setProcessedData([]);
  }, [toast]);

  const extractInvoiceDetails = (text: string): Partial<ExtractedInvoiceData> => {
    // Basic regex patterns for common invoice fields
    const invoiceNumberPattern = /(?:invoice\s*(?:no|number|#)[:,]?\s*)([A-Z0-9-]+)/i;
    const amountPattern = /(?:amount|total|subtotal)[:,]?\s*(?:₹|rs\.?\s*)?([0-9,]+(?:\.\d{2})?)/i;
    const gstPattern = /(?:gst|tax)[:,]?\s*(?:₹|rs\.?\s*)?([0-9,]+(?:\.\d{2})?)/i;
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
    const clientPattern = /(?:to|bill\s*to|client)[:,]?\s*([A-Za-z\s&.,]+)/i;

    const invoiceNumber = text.match(invoiceNumberPattern)?.[1] || '';
    const amount = text.match(amountPattern)?.[1]?.replace(/,/g, '') || '';
    const gstAmount = text.match(gstPattern)?.[1]?.replace(/,/g, '') || '';
    const clientName = text.match(clientPattern)?.[1]?.trim() || '';
    const dates = text.match(datePattern);
    
    return {
      invoiceNumber,
      clientName,
      amount,
      gstAmount,
      totalAmount: amount && gstAmount ? (parseFloat(amount) + parseFloat(gstAmount)).toString() : amount,
      invoiceDate: dates?.[0] || '',
      dueDate: dates?.[0] || '',
    };
  };

  const processFiles = async () => {
    if (files.length === 0) {
      toast({
        title: "No Files",
        description: "Please select files to process.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    const results: ExtractedInvoiceData[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFile(file.name);
      setProgress(((i + 1) / files.length) * 100);

      try {
        console.log(`Processing file: ${file.name}`);
        
        const { data: { text } } = await Tesseract.recognize(file, 'eng', {
          logger: m => console.log(m)
        });

        console.log(`Extracted text from ${file.name}:`, text);

        const extractedData = extractInvoiceDetails(text);
        
        results.push({
          fileName: file.name,
          status: 'success',
          ...extractedData,
        } as ExtractedInvoiceData);

      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        results.push({
          fileName: file.name,
          invoiceNumber: '',
          clientName: '',
          amount: '',
          gstAmount: '',
          totalAmount: '',
          invoiceDate: '',
          dueDate: '',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    setProcessedData(results);
    setIsProcessing(false);
    setCurrentFile('');
    
    toast({
      title: "Processing Complete",
      description: `Processed ${results.length} files. ${results.filter(r => r.status === 'success').length} successful.`,
    });
  };

  const generateCSV = (data: ExtractedInvoiceData[]): string => {
    const headers = [
      'File Name',
      'Invoice Number',
      'Client Name',
      'Amount',
      'GST Amount',
      'Total Amount',
      'Invoice Date',
      'Due Date',
      'Status',
      'Error'
    ];

    const csvRows = [
      headers.join(','),
      ...data.map(row => [
        `"${row.fileName}"`,
        `"${row.invoiceNumber}"`,
        `"${row.clientName}"`,
        `"${row.amount}"`,
        `"${row.gstAmount}"`,
        `"${row.totalAmount}"`,
        `"${row.invoiceDate}"`,
        `"${row.dueDate}"`,
        `"${row.status}"`,
        `"${row.error || ''}"`
      ].join(','))
    ];

    return csvRows.join('\n');
  };

  const downloadCSV = () => {
    if (processedData.length === 0) return;

    const csv = generateCSV(processedData);
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const currentDate = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `Extracted_Invoice_Data_${currentDate}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFiles([]);
    setProcessedData([]);
    setProgress(0);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bulk Invoice Processing</CardTitle>
          <CardDescription>
            Upload PDF or image files to extract invoice data automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <div className="space-y-2">
              <label htmlFor="bulk-file-upload" className="cursor-pointer">
                <span className="text-sm font-medium">Upload Invoice Files</span>
                <input
                  id="bulk-file-upload"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Supported formats: PDF, JPG, PNG, WEBP
              </p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Selected Files ({files.length})</h3>
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear All
                </Button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm truncate">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Processing: {currentFile}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={processFiles}
              disabled={files.length === 0 || isProcessing}
              className="flex-1"
            >
              <FileText className="h-4 w-4 mr-2" />
              {isProcessing ? "Processing..." : "Extract Data"}
            </Button>
            
            {processedData.length > 0 && (
              <Button onClick={downloadCSV} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {processedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Results</CardTitle>
            <CardDescription>
              Extracted data from {processedData.length} files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {processedData.map((data, index) => (
                <div
                  key={index}
                  className={`p-3 rounded border ${
                    data.status === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {data.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-medium text-sm">{data.fileName}</span>
                  </div>
                  
                  {data.status === 'success' ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Invoice:</span>
                        <div>{data.invoiceNumber || 'Not found'}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Client:</span>
                        <div>{data.clientName || 'Not found'}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Amount:</span>
                        <div>₹{data.totalAmount || 'Not found'}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date:</span>
                        <div>{data.invoiceDate || 'Not found'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-red-600">{data.error}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BulkInvoiceProcessor;
