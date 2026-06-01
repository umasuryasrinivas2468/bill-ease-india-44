import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@clerk/clerk-react';
import { postExpenseToLedger } from '@/utils/journalPosting';
import { Expense } from '@/types/expenses';
import { Book, CheckCircle } from 'lucide-react';

interface PostToLedgerButtonProps {
  expense: Expense;
  onSuccess?: () => void;
}

const PostToLedgerButton: React.FC<PostToLedgerButtonProps> = ({ expense, onSuccess }) => {
  const { user } = useUser();
  const { toast } = useToast();

  const handlePostToLedger = async () => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive",
      });
      return;
    }

    if (expense.posted_to_ledger) {
      toast({
        title: "Already Posted",
        description: "This expense has already been posted to the ledger",
        variant: "destructive",
      });
      return;
    }

    try {
      await postExpenseToLedger(user.id, {
        id: expense.id,
        expense_date: expense.expense_date,
        vendor_name: expense.vendor_name,
        vendor_id: (expense as any).vendor_id ?? undefined,
        category_name: expense.category_name,
        amount: Number(expense.amount),
        tax_amount: Number(expense.tax_amount),
        tds_amount: Number((expense as any).tds_amount ?? 0),
        payment_mode: expense.payment_mode,
        description: expense.description,
        is_rcm: (expense as any).is_rcm,
        itc_eligible: (expense as any).itc_eligible,
        cost_center_id: (expense as any).cost_center_id ?? undefined,
        project_id: (expense as any).project_id ?? undefined,
        branch_id: (expense as any).branch_id ?? undefined,
      });

      toast({
        title: "Posted to Ledger",
        description: "Expense has been successfully posted to the ledger",
      });

      onSuccess?.();
    } catch (error) {
      console.error('Error posting to ledger:', error);
      toast({
        title: "Posting Failed",
        description: error instanceof Error ? error.message : "Failed to post expense to ledger",
        variant: "destructive",
      });
    }
  };

  if (expense.posted_to_ledger) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
        Posted
      </Button>
    );
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handlePostToLedger}
      className="text-blue-600 hover:text-blue-700"
    >
      <Book className="h-4 w-4 mr-2" />
      Post to Ledger
    </Button>
  );
};

export default PostToLedgerButton;