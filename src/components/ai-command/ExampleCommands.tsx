import React from 'react';
import { Lightbulb, FileText, Users, Package, HelpCircle, BarChart3, Receipt, CreditCard, ShoppingCart, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const EXAMPLE_COMMANDS = [
  { text: "Create invoice for ABC Traders for ₹25,000 with 18% GST", icon: FileText, category: "create" },
  { text: "Add expense ₹5000 for travel from MakeMyTrip", icon: Receipt, category: "create" },
  { text: "Create sales order for Delta Corp for ₹1 lakh", icon: ShoppingCart, category: "create" },
  { text: "Add purchase bill from XYZ Supplies for ₹15000", icon: Truck, category: "create" },
  { text: "Record payment of ₹10000 from ABC Traders", icon: CreditCard, category: "action" },
  { text: "Check stock of Laptop", icon: Package, category: "query" },
  { text: "Add client named Rohit Sharma email rohit@test.com", icon: Users, category: "create" },
  { text: "What is GST reverse charge?", icon: HelpCircle, category: "question" },
];

interface ExampleCommandsProps {
  onSelect: (command: string) => void;
  disabled?: boolean;
}

export const ExampleCommands: React.FC<ExampleCommandsProps> = ({ onSelect, disabled }) => {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <Lightbulb className="h-3.5 w-3.5" />
        Try these examples
      </div>
      <div className="grid gap-2">
        {EXAMPLE_COMMANDS.map((example, idx) => {
          const Icon = example.icon;
          return (
            <Button
              key={idx}
              variant="ghost"
              onClick={() => onSelect(example.text)}
              disabled={disabled}
              className={cn(
                "justify-start h-auto py-2.5 px-3 text-left whitespace-normal text-xs font-normal",
                "hover:bg-primary/10",
                "border border-transparent hover:border-orange-500/20 transition-all duration-200"
              )}
            >
              <Icon className="h-3.5 w-3.5 mr-2 shrink-0 text-orange-500" />
              <span>{example.text}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default ExampleCommands;
