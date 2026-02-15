import React from 'react';
import { Lightbulb, FileText, Users, Package, HelpCircle, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const EXAMPLE_COMMANDS = [
  { text: "Create an invoice for ABC Traders for ₹25,000 with GST", icon: FileText, category: "create" },
  { text: "Add a vendor named XYZ Supplies from Delhi", icon: Users, category: "create" },
  { text: "Add inventory item Laptop at ₹50000 with 10 units", icon: Package, category: "create" },
  { text: "What is GST reverse charge?", icon: HelpCircle, category: "question" },
  { text: "Show me my P&L report overview", icon: BarChart3, category: "report" },
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
                "hover:bg-gradient-to-r hover:from-orange-500/10 hover:to-blue-600/10",
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
