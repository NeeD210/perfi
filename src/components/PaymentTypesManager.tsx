import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { animated } from "@react-spring/web";
import { useGesture } from "@use-gesture/react";
import { Trash2 } from "lucide-react";
import { PaymentTypeForm } from "@/components/PaymentTypeForm";

type PaymentTypeDoc = {
  _id: Id<"paymentTypes">;
  name: string;
  isCredit?: boolean;
  closingDay?: number;
  dueDay?: number;
};

export default function PaymentTypesManager() {
  const { toast } = useToast();
  const paymentTypes = (useQuery(api.expenses.getPaymentTypes) as PaymentTypeDoc[] | undefined) ?? [];
  const updatePaymentTypes = useMutation(api.expenses.updatePaymentTypes);

  const [screenWidth, setScreenWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 375);
  const swipePositions = useRef<Record<string, number>>({});
  const [swipeStates, setSwipeStates] = useState<Record<string, number>>({});

  const [editingType, setEditingType] = useState<PaymentTypeDoc | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const sortedPaymentTypes = useMemo(
    () => paymentTypes.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [paymentTypes]
  );

  const getDeleteZoneProgress = (x: number) => {
    if (x >= 0) return 0;
    const max = screenWidth * 0.3;
    const progress = Math.min(Math.abs(x) / max, 1);
    return progress;
  };

  const triggerHapticFeedback = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const bindSwipe = useGesture({
    onDrag: ({ movement: [x], down, args: [id] }) => {
      if (down) {
        const maxLeft = -screenWidth * 0.4;
        const maxRight = 0;
        const newX = Math.max(maxLeft, Math.min(maxRight, x));
        swipePositions.current[id] = newX;
        setSwipeStates(prev => ({ ...prev, [id]: newX }));

        const leftThreshold = -screenWidth * 0.3;
        if (newX < leftThreshold) {
          triggerHapticFeedback();
        }
      } else {
        const leftThreshold = -screenWidth * 0.3;
        if (swipePositions.current[id] < leftThreshold) {
          handleDelete(id as Id<'paymentTypes'>);
        }
        swipePositions.current[id] = 0;
        setSwipeStates(prev => ({ ...prev, [id]: 0 }));
      }
    }
  });

  const handleDelete = async (id: Id<'paymentTypes'>) => {
    try {
      // Remove payment type from list using updatePaymentTypes
      const updatedPaymentTypes = paymentTypes
        .filter(pt => pt._id !== id)
        .map(pt => ({
          _id: pt._id,  // ✅ Preserve IDs
          name: pt.name,
          isCredit: pt.isCredit ?? false,
          closingDay: pt.closingDay,
          dueDay: pt.dueDay,
        }));
      
      await updatePaymentTypes({ paymentTypes: updatedPaymentTypes });
      toast({ title: "Success", description: "Payment type deleted" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete payment type" });
    }
  };

  return (
    <div className="grid gap-3">
      {sortedPaymentTypes.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">No payment types found.</CardContent>
        </Card>
      ) : (
        sortedPaymentTypes.map((pt) => (
          <div key={pt._id as string} className="relative">
            <div
              className="absolute inset-0 flex items-center justify-end pr-6 bg-red-500 text-white"
              style={{ opacity: getDeleteZoneProgress(swipeStates[pt._id as string] || 0) }}
            >
              <Trash2 size={24} />
            </div>
            <animated.div
              {...bindSwipe(pt._id)}
              style={{
                transform: `translateX(${swipeStates[pt._id as string] || 0}px)`,
                touchAction: "pan-y",
              }}
            >
              <Card
                onClick={() => { setEditingType(pt); setIsEditDialogOpen(true); }}
                className="relative shadow-sm cursor-pointer"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{pt.name}</div>
                    <Badge variant="secondary" className="text-xs">
                      {pt.isCredit ? "Credit" : "Debit"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </animated.div>
          </div>
        ))
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if (!open) { setIsEditDialogOpen(false); setEditingType(null); } }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md p-4 rounded-xl border bg-card text-card-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Payment Type</DialogTitle>
          </DialogHeader>
          {editingType && (
            <PaymentTypeForm
              initialData={{
                id: editingType._id,
                name: editingType.name,
                isCredit: editingType.isCredit ?? false,
                closingDay: editingType.closingDay,
                dueDay: editingType.dueDay,
              }}
              onSuccess={() => { setIsEditDialogOpen(false); setEditingType(null); }}
              onCancel={() => { setIsEditDialogOpen(false); setEditingType(null); }}
              renderActions={({ handleSubmit }) => (
                <div className="flex items-center justify-between mt-2">
                  <Button
                    variant="destructive"
                    type="button"
                    onClick={async () => {
                      if (!editingType) return;
                      await handleDelete(editingType._id);
                      setIsEditDialogOpen(false);
                      setEditingType(null);
                    }}
                  >
                    Delete
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => { setIsEditDialogOpen(false); setEditingType(null); }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Update</Button>
                  </div>
                </div>
              )}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


