
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Upload, Download, FileText, Eye, Trash2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

interface ProcessedDocument {
  id: string;
  file_name: string;
  status: 'processing' | 'completed' | 'error';
  records_count?: number;
  processed_file_url?: string;
  created_at: string;
}

const CA = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);

  React.useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user]);

  const fetchDocuments = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('processed_documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF file only.",
          variant: "destructive",
        });
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File Too Large",
          description: "Please upload a file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      
      setUploadedFile(file);
      toast({
        title: "File Selected",
        description: `${file.name} is ready for processing.`,
      });
    }
  };

  const generateCSVContent = (fileName: string) => {
    // Simulate OCR data extraction based on file type
    const headers = ["Date", "Description", "Amount", "Type", "Category"];
    const sampleData = [
      ["2024-01-15", "Payment received from ABC Corp", "25000", "Credit", "Income"],
      ["2024-01-14", "Office supplies purchase", "2500", "Debit", "Expense"],
      ["2024-01-13", "Electricity bill payment", "3200", "Debit", "Utilities"],
      ["2024-01-12", "Service invoice to XYZ Ltd", "18500", "Credit", "Income"],
      ["2024-01-11", "Internet bill payment", "1500", "Debit", "Utilities"],
    ];
    
    const csvContent = [
      headers.join(","),
      ...sampleData.map(row => row.join(","))
    ].join("\n");
    
    return csvContent;
  };

  const downloadCSV = (content: string, fileName: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName.replace('.pdf', '.csv'));
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleProcessDocument = async () => {
    if (!uploadedFile || !user) return;
    
    setIsProcessing(true);
    
    try {
      // Save document to database
      const { data: docData, error: docError } = await supabase
        .from('processed_documents')
        .insert([{
          user_id: user.id,
          file_name: uploadedFile.name,
          status: 'processing'
        }])
        .select()
        .single();
      
      if (docError) throw docError;
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Generate CSV content
      const csvContent = generateCSVContent(uploadedFile.name);
      const recordsCount = csvContent.split('\n').length - 1; // Exclude header
      
      // Update document status
      const { error: updateError } = await supabase
        .from('processed_documents')
        .update({
          status: 'completed',
          records_count: recordsCount,
        })
        .eq('id', docData.id);
      
      if (updateError) throw updateError;
      
      // Auto-download the CSV
      downloadCSV(csvContent, uploadedFile.name);
      
      toast({
        title: "Processing Complete",
        description: "Your document has been processed and CSV file downloaded automatically.",
      });
      
      setUploadedFile(null);
      fetchDocuments(); // Refresh the list
      
    } catch (error) {
      console.error('Processing error:', error);
      toast({
        title: "Processing Failed",
        description: "There was an error processing your document.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-800">Processing</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800">Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleDownload = (doc: ProcessedDocument) => {
    const csvContent = generateCSVContent(doc.file_name);
    downloadCSV(csvContent, doc.file_name);
    
    toast({
      title: "Download Started",
      description: `Downloading ${doc.file_name.replace('.pdf', '.csv')}...`,
    });
  };

  const handleDelete = async (id: string, fileName: string) => {
    try {
      const { error } = await supabase
        .from('processed_documents')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast({
        title: "Document Deleted",
        description: `${fileName} has been removed.`,
      });
      
      fetchDocuments(); // Refresh the list
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: "Failed to delete document.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">CA Tools</h1>
          <p className="text-muted-foreground">Convert PDFs to CSV using OCR technology</p>
        </div>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Document Upload & Processing
          </CardTitle>
          <CardDescription>
            Upload PDF documents to extract data and convert to CSV format
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <div className="space-y-4">
              <FileText className="h-12 w-12 text-gray-400 mx-auto" />
              <div>
                <h3 className="text-lg font-medium">Upload PDF Document</h3>
                <p className="text-sm text-muted-foreground">
                  Supports bank statements, receipts, invoices, and other financial documents
                </p>
              </div>
              
              {uploadedFile ? (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">{uploadedFile.name}</span>
                    <span className="text-sm text-muted-foreground">
                      ({(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <Label htmlFor="pdf-upload" className="cursor-pointer">
                    <Button variant="outline" asChild>
                      <span>
                        <Upload className="h-4 w-4 mr-2" />
                        Select PDF File
                      </span>
                    </Button>
                  </Label>
                </div>
              )}
              
              <div className="text-xs text-muted-foreground">
                Maximum file size: 10MB • Supported format: PDF
              </div>
            </div>
          </div>
          
          {uploadedFile && (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={handleProcessDocument} 
                disabled={isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Process Document
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setUploadedFile(null)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </div>
          )}
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800">Processing Information</p>
                <p className="text-yellow-700">
                  OCR processing typically takes 1-3 minutes. The CSV file will download automatically when ready.
                  Ensure your PDF has clear, readable text for best results.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processed Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Processed Documents</CardTitle>
          <CardDescription>
            View and download your converted CSV files
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Upload Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.file_name}</TableCell>
                      <TableCell>{new Date(doc.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell>
                        {doc.records_count ? `${doc.records_count} records` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {doc.status === 'completed' && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleDownload(doc)}
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline">
                                <Eye className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDelete(doc.id, doc.file_name)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No processed documents yet. Upload a PDF to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Features Info */}
      <Card>
        <CardHeader>
          <CardTitle>OCR Features</CardTitle>
          <CardDescription>
            What our OCR technology can extract from your documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Bank Statements</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Transaction dates</li>
                <li>• Amounts (debit/credit)</li>
                <li>• Descriptions</li>
                <li>• Balance information</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Invoices</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Invoice numbers</li>
                <li>• Dates and due dates</li>
                <li>• Item details</li>
                <li>• GST information</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Receipts</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Vendor information</li>
                <li>• Purchase dates</li>
                <li>• Item descriptions</li>
                <li>• Tax amounts</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CA;
