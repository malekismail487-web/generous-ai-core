import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  detectedTopic?: string;
  reason?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function RelevanceWarningDialog({
  open, onOpenChange, categoryName, detectedTopic, reason, onConfirm, onCancel,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Content may not match your category
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <div>
                Your assigned category is <span className="font-semibold">{categoryName}</span>
                {detectedTopic ? <>, but this content looks like <span className="font-semibold">{detectedTopic}</span>.</> : '.'}
              </div>
              {reason && <div className="text-muted-foreground italic">"{reason}"</div>}
              <div>Do you want to post it anyway?</div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onCancel?.()}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm()}>Post anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
