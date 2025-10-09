import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { PaymentTypeForm } from "./PaymentTypeForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

interface PaymentType {
  _id: Id<"paymentTypes">;
  name: string;
  isCredit?: boolean;
  closingDay?: number;
  dueDay?: number;
}

// Memoized payment type card component
const PaymentTypeCard = React.memo(({ 
  type, 
  onEdit 
}: { 
  type: PaymentType; 
  onEdit: (type: PaymentType) => void;
}) => (
  <Card>
    <CardContent className="p-4">
      <div 
        className="flex-1 cursor-pointer hover:bg-accent/50 p-2 rounded-md transition-colors"
        onClick={() => onEdit(type)}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="font-medium text-foreground">{type.name}</div>
              {type.isCredit ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Credit
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Debit
                </span>
              )}
            </div>
            {type.isCredit && type.closingDay && type.dueDay && (
              <div className="text-sm text-muted-foreground">
                Closing: {type.closingDay} | Due: {type.dueDay}
              </div>
            )}
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
));

PaymentTypeCard.displayName = 'PaymentTypeCard';

export function PaymentTypeList() {
  const [isAdding, setIsAdding] = useState(false);
  const [editingType, setEditingType] = useState<PaymentType | null>(null);

  const paymentTypes = useQuery(api.expenses.getPaymentTypes) ?? [];
  const updatePaymentTypes = useMutation(api.expenses.updatePaymentTypes);

  // Memoize sorted payment types
  const sortedPaymentTypes = useMemo(() => 
    [...paymentTypes].sort((a, b) => a.name.localeCompare(b.name)),
    [paymentTypes]
  );

  const handleDelete = useCallback(async (id: Id<"paymentTypes">) => {
    if (window.confirm("Are you sure you want to delete this payment type?")) {
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
        setEditingType(null);
      } catch (error) {
        console.error("Error deleting payment type:", error);
        alert("Error deleting payment type. Please try again.");
      }
    }
  }, [updatePaymentTypes, paymentTypes]);

  const handleEdit = useCallback((type: PaymentType) => {
    setEditingType(type);
  }, []);

  const handleAddNew = useCallback(() => {
    setIsAdding(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsAdding(false);
    setEditingType(null);
  }, []);

  // Memoize the row renderer for the virtualized list
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <PaymentTypeCard 
        type={sortedPaymentTypes[index]} 
        onEdit={handleEdit}
      />
    </div>
  ), [sortedPaymentTypes, handleEdit]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Payment Types</h2>
        <Button
          onClick={handleAddNew}
          className="inline-flex items-center px-4 py-2"
        >
          Add Payment Type
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-medium text-foreground mb-4">Add Payment Type</h3>
            <PaymentTypeForm
              onSuccess={handleCloseForm}
              onCancel={handleCloseForm}
            />
          </CardContent>
        </Card>
      )}

      {editingType && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-medium text-foreground mb-4">Edit Payment Type</h3>
            <PaymentTypeForm
              initialData={{
                id: editingType._id,
                name: editingType.name,
                isCredit: editingType.isCredit ?? false,
                closingDay: editingType.closingDay,
                dueDay: editingType.dueDay,
              }}
              onSuccess={handleCloseForm}
              onCancel={handleCloseForm}
              renderActions={({ handleSubmit }) => (
                <div className="mt-4 flex justify-between w-full">
                  <Button
                    variant="destructive"
                    type="button"
                    onClick={() => handleDelete(editingType._id)}
                  >
                    Delete
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={handleCloseForm}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                    >
                      Update
                    </Button>
                  </div>
                </div>
              )}
            />
          </CardContent>
        </Card>
      )}

      <div className="h-[400px]">
        <AutoSizer>
          {({ height, width }: { height: number; width: number }) => (
            <List
              height={height}
              itemCount={sortedPaymentTypes.length}
              itemSize={100} // Adjust based on your PaymentTypeCard height
              width={width}
            >
              {Row}
            </List>
          )}
        </AutoSizer>
      </div>
    </div>
  );
} 