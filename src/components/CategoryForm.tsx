import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CategoryFormProps {
  transactionType: "expense" | "income";
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: {
    id: Id<"categories">;
    name: string;
  };
  renderActions?: (props: { handleSubmit: (e: React.FormEvent) => void }) => React.ReactNode;
}

export function CategoryForm({ transactionType, onSuccess, onCancel, initialData, renderActions }: CategoryFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");

  const updateCategories = useMutation(api.expenses.updateCategories);
  const existingCategories = (useQuery(api.expenses.getCategoriesWithIds) ?? []) as Array<{ _id: Id<"categories">; name: string; transactionType?: string; }>;

  const normalizedExisting = useMemo(() => existingCategories.map(c => ({
    id: c._id,
    name: c.name,
    transactionType: (c.transactionType ?? "expense") as "expense" | "income",
  })), [existingCategories]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Name is required");
      return;
    }

    try {
      let next: Array<{ _id?: Id<"categories">; name: string; transactionType: string }>; 
      if (initialData) {
        // Update existing category by id
        next = normalizedExisting.map(c => 
          c.id === initialData.id 
            ? { _id: initialData.id, name: trimmed, transactionType }  // ✅ Include ID for update
            : { _id: c.id, name: c.name, transactionType: c.transactionType }  // ✅ Preserve IDs
        );
      } else {
        // Add a new category (no ID for new)
        next = [
          ...normalizedExisting.map(c => ({ _id: c.id, name: c.name, transactionType: c.transactionType })),  // ✅ Preserve IDs
          { name: trimmed, transactionType },  // No ID for new category
        ];
      }

      await updateCategories({ categories: next });
      onSuccess?.();
    } catch (error) {
      console.error("Error saving category:", error);
      alert("Error saving category. Please try again.");
    }
  }, [name, initialData, normalizedExisting, transactionType, updateCategories, onSuccess]);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter category name"
          required
          className="h-10"
        />
      </div>

      {renderActions ? (
        renderActions({ handleSubmit })
      ) : (
        <div className="flex justify-end space-x-3">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          )}
          <Button type="submit">{initialData ? "Update" : "Create"}</Button>
        </div>
      )}
    </form>
  );
}

export default CategoryForm;


