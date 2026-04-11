import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Percent } from 'lucide-react';
import { useTDSRules, useCreateTDSRule, useUpdateTDSRule, useDeleteTDSRule } from '@/hooks/useTDSRules';
import type { CreateTDSRuleData } from '@/types/tds';
import { useForm } from 'react-hook-form';

interface TDSRuleForm extends CreateTDSRuleData {}

const TDSSetup = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  
  const { data: tdsRules = [], isLoading } = useTDSRules();
  const createTDSRule = useCreateTDSRule();
  const updateTDSRule = useUpdateTDSRule();
  const deleteTDSRule = useDeleteTDSRule();

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<TDSRuleForm>();

  const predefinedCategories = [
    'Professional Fees',
    'Contractor Payments', 
    'Rent Payments',
    'Commission and Brokerage',
    'Interest Payments',
    'Salary',
    'Freight and Transport',
    'Advertising',
    'Insurance Premium',
    'Other Services'
  ];

  const handleCreateOrUpdate = async (data: TDSRuleForm) => {
    try {
      if (editingRule) {
        await updateTDSRule.mutateAsync({ 
          id: editingRule.id, 
          updates: data 
        });
      } else {
        await createTDSRule.mutateAsync(data);
      }
      setIsDialogOpen(false);
      reset();
      setEditingRule(null);
    } catch (error) {
      console.error('Error saving TDS rule:', error);
    }
  };

  const handleEdit = (rule: any) => {
    setEditingRule(rule);
    setValue('category', rule.category);
    setValue('rate_percentage', rule.rate_percentage);
    setValue('description', rule.description || '');
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this TDS rule?')) {
      await deleteTDSRule.mutateAsync(id);
    }
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    reset();
    setEditingRule(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              TDS Rules Setup
            </CardTitle>
            <CardDescription>
              Configure TDS rates for different payment categories
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add TDS Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingRule ? 'Edit TDS Rule' : 'Add New TDS Rule'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(handleCreateOrUpdate)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select 
                    onValueChange={(value) => setValue('category', value)}
                    defaultValue={editingRule?.category}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {predefinedCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.category && (
                    <p className="text-sm text-red-500">Category is required</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rate_percentage">TDS Rate (%)</Label>
                  <Input
                    id="rate_percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="e.g., 10.00"
                    {...register('rate_percentage', { 
                      required: 'Rate is required',
                      min: { value: 0, message: 'Rate must be positive' },
                      max: { value: 100, message: 'Rate cannot exceed 100%' }
                    })}
                  />
                  {errors.rate_percentage && (
                    <p className="text-sm text-red-500">{errors.rate_percentage.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="e.g., TDS on Professional or Technical Services - Section 194J"
                    {...register('description')}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1">
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading TDS rules...</div>
        ) : tdsRules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No TDS rules configured. Add your first rule to get started.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Rate (%)</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tdsRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.category}</TableCell>
                    <TableCell>{rule.rate_percentage}%</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {rule.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(rule)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">TDS Rate Guidelines</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <p>• Professional/Technical Services: 10% (Section 194J)</p>
            <p>• Contractor Payments: 1-2% (Section 194C)</p>
            <p>• Rent Payments: 10% (Section 194I)</p>
            <p>• Commission & Brokerage: 5% (Section 194H)</p>
            <p>• Interest Payments: 10% (Section 194A)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TDSSetup;