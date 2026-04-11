
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useUPICollections, useCheckUPIStatus } from '@/hooks/useUPICollection';
import { useToast } from '@/hooks/use-toast';

const UPICollectionHistory = () => {
  const { data: collections = [], isLoading } = useUPICollections();
  const checkStatus = useCheckUPIStatus();
  const { toast } = useToast();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'expired':
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      expired: 'bg-gray-100 text-gray-800',
    };

    return (
      <Badge className={variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const handleCheckStatus = async (transactionRefId: string) => {
    if (!transactionRefId) {
      toast({
        title: "Error",
        description: "No transaction reference ID available for status check.",
        variant: "destructive",
      });
      return;
    }

    try {
      const status = await checkStatus.mutateAsync(transactionRefId);
      toast({
        title: "Status Updated",
        description: `Transaction status: ${status.status || 'Unknown'}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to check transaction status.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>UPI Collection History</CardTitle>
        <CardDescription>
          Track all your UPI payment requests and their status
        </CardDescription>
      </CardHeader>
      <CardContent>
        {collections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No UPI collection requests yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference ID</TableHead>
                  <TableHead>Payer UPI</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collections.map((collection) => (
                  <TableRow key={collection.id}>
                    <TableCell className="font-mono text-sm">
                      {collection.reference_id}
                    </TableCell>
                    <TableCell>{collection.payer_vpa || '-'}</TableCell>
                    <TableCell>₹{collection.amount.toLocaleString()}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {collection.purpose_message}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(collection.status)}
                        {getStatusBadge(collection.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(collection.expiry_time).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCheckStatus(collection.transaction_ref_id || '')}
                        disabled={checkStatus.isPending || !collection.transaction_ref_id}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Check Status
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UPICollectionHistory;
