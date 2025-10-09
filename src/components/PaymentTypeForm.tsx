import React, { useState, useMemo, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface PaymentTypeFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: {
    id: Id<"paymentTypes">;
    name: string;
    isCredit: boolean;
    closingDay?: number;
    dueDay?: number;
  };
  renderActions?: (props: { handleSubmit: (e: React.FormEvent) => void }) => React.ReactNode;
}

// Memoized form field components
const FormField = React.memo(({ 
  label, 
  children 
}: { 
  label: string; 
  children: React.ReactNode;
}) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    {children}
  </div>
));

FormField.displayName = 'FormField';

const CreditCardFields = React.memo(({ 
  closingDay, 
  setClosingDay, 
  dueDay, 
  setDueDay 
}: { 
  closingDay: string;
  setClosingDay: (value: string) => void;
  dueDay: string;
  setDueDay: (value: string) => void;
}) => (
  <div className="grid grid-cols-2 gap-4">
    <FormField label="Closing Day (1-31)">
      <Input
        id="closingDay"
        type="number"
        value={closingDay}
        onChange={(e) => setClosingDay(e.target.value)}
        min="1"
        max="31"
        required
        className="h-10"
      />
    </FormField>

    <FormField label="Due Day (1-31)">
      <Input
        id="dueDay"
        type="number"
        value={dueDay}
        onChange={(e) => setDueDay(e.target.value)}
        min="1"
        max="31"
        required
        className="h-10"
      />
    </FormField>
  </div>
));

CreditCardFields.displayName = 'CreditCardFields';

export function PaymentTypeForm({ onSuccess, onCancel, initialData, renderActions }: PaymentTypeFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [isCredit, setIsCredit] = useState(initialData?.isCredit ?? false);
  const [closingDay, setClosingDay] = useState(initialData?.closingDay?.toString() ?? "");
  const [dueDay, setDueDay] = useState(initialData?.dueDay?.toString() ?? "");

  const updatePaymentTypes = useMutation(api.expenses.updatePaymentTypes);
  const existingPaymentTypes = useQuery(api.expenses.getPaymentTypes) ?? [];

  // Memoize form validation
  const validateForm = useCallback(() => {
    if (!name.trim()) {
      throw new Error("Name is required");
    }

    if (isCredit) {
      const closingDayNum = parseInt(closingDay);
      const dueDayNum = parseInt(dueDay);
      
      if (isNaN(closingDayNum) || isNaN(dueDayNum)) {
        throw new Error("Closing day and due day must be numbers");
      }
      
      if (closingDayNum < 1 || closingDayNum > 31 || dueDayNum < 1 || dueDayNum > 31) {
        throw new Error("Closing day and due day must be between 1 and 31");
      }
    }
  }, [name, isCredit, closingDay, dueDay]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      validateForm();

      // Build payment types array (works for both create and update)
      const paymentTypeData = {
        _id: initialData?.id,  // ✅ Include ID for updates
        name,
        isCredit,
        closingDay: isCredit ? parseInt(closingDay) : undefined,
        dueDay: isCredit ? parseInt(dueDay) : undefined,
      };

      let updatedPaymentTypes;
      if (initialData) {
        // Update existing payment type
        updatedPaymentTypes = existingPaymentTypes.map(type => {
          if (type._id === initialData.id) {
            return paymentTypeData;
          }
          return {
            _id: type._id,  // ✅ Preserve IDs
            name: type.name,
            isCredit: type.isCredit ?? false,
            closingDay: type.closingDay,
            dueDay: type.dueDay,
          };
        });
      } else {
        // Create new payment type - add to existing list (no ID for new items)
        updatedPaymentTypes = [
          ...existingPaymentTypes.map(type => ({
            _id: type._id,  // ✅ Preserve IDs
            name: type.name,
            isCredit: type.isCredit ?? false,
            closingDay: type.closingDay,
            dueDay: type.dueDay,
          })),
          paymentTypeData,
        ];
      }

      await updatePaymentTypes({
        paymentTypes: updatedPaymentTypes,
      });
      onSuccess?.();
    } catch (error) {
      console.error("Error saving payment type:", error);
      alert(error instanceof Error ? error.message : "Error saving payment type. Please try again.");
    }
  }, [name, isCredit, closingDay, dueDay, initialData, existingPaymentTypes, updatePaymentTypes, onSuccess, validateForm]);

  // Memoize the credit card fields
  const creditCardFields = useMemo(() => {
    if (!isCredit) return null;
    return (
      <CreditCardFields
        closingDay={closingDay}
        setClosingDay={setClosingDay}
        dueDay={dueDay}
        setDueDay={setDueDay}
      />
    );
  }, [isCredit, closingDay, dueDay]);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField label="Name">
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter payment type name"
          required
          className="h-10"
        />
      </FormField>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="isCredit"
          checked={isCredit}
          onCheckedChange={(checked: boolean | "indeterminate") => setIsCredit(checked === true)}
        />
        <Label htmlFor="isCredit" className="text-sm font-normal">
          This is a credit card
        </Label>
      </div>

      {creditCardFields}

      {renderActions ? (
        renderActions({ handleSubmit })
      ) : (
        <div className="flex justify-end space-x-3">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
          >
            {initialData ? "Update" : "Create"}
          </Button>
        </div>
      )}
    </form>
  );
} 