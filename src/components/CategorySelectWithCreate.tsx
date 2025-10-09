import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type TransactionType = "expense" | "income";

interface CategoryRecord {
	_id: Id<"categories">;
	name: string;
	transactionType?: string;
}

interface CategorySelectWithCreateProps {
	value: Id<"categories"> | "" | string;
	onChange: (value: Id<"categories"> | "") => void;
	transactionType: TransactionType;
	disabled?: boolean;
}

export default function CategorySelectWithCreate({ value, onChange, transactionType, disabled }: CategorySelectWithCreateProps) {
	const { toast } = useToast();
	const categoriesData = useQuery(api.expenses.getCategoriesWithIds) as CategoryRecord[] | undefined;
	const updateCategories = useMutation(api.expenses.updateCategories);

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [newCategoryName, setNewCategoryName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [pendingSelectName, setPendingSelectName] = useState<string | null>(null);

	const categories = categoriesData ?? [];
	const filteredCategories = useMemo(() => {
		return categories.filter(c => (c.transactionType ? c.transactionType === transactionType : true));
	}, [categories, transactionType]);

	const handleAddCategory = useCallback(async () => {
		const name = newCategoryName.trim();
		if (!name) {
			toast({ title: "Invalid name", description: "Please enter a category name." });
			return;
		}
		setIsSubmitting(true);
		try {
			// Build full list preserving existing categories for both transaction types
			const existing = categories.map(c => ({ _id: c._id, name: c.name, transactionType: c.transactionType ?? "expense" }));  // ✅ Preserve IDs
			const existsSame = existing.some(c => c.name === name && c.transactionType === transactionType);
			const payload = existsSame ? existing : [...existing, { name, transactionType }];  // No ID for new category
			await updateCategories({ categories: payload });
			setPendingSelectName(name);
			setIsDialogOpen(false);
			setNewCategoryName("");
			toast({ title: existsSame ? "Category exists" : "Category added", description: existsSame ? "We selected the existing category." : "New category created." });
		} catch (err: any) {
			toast({ title: "Error", description: err?.message ?? "Failed to add category" });
		} finally {
			setIsSubmitting(false);
		}
	}, [categories, categoriesData, newCategoryName, onChange, toast, transactionType, updateCategories]);

	// Auto-select newly created/restored category when it appears in the reactive list
	useEffect(() => {
		if (!pendingSelectName || !categoriesData) return;
		const latest = categoriesData.find(c => c.name === pendingSelectName && (c.transactionType ?? "expense") === transactionType);
		if (latest) {
			onChange(latest._id as Id<"categories">);
			setPendingSelectName(null);
		}
	}, [categoriesData, onChange, pendingSelectName, transactionType]);

	return (
		<>
			<Select
				value={value as string}
				onValueChange={(val) => {
					if (val === "__add_new__") {
						setIsDialogOpen(true);
						return;
					}
					onChange(val as Id<"categories">);
				}}
				disabled={disabled}
			>
				<SelectTrigger>
					<SelectValue placeholder="Select a category" />
				</SelectTrigger>
				<SelectContent>
					{filteredCategories
						.sort((a, b) => a.name.localeCompare(b.name))
						.map(c => (
							<SelectItem key={c._id as string} value={c._id as string}>{c.name}</SelectItem>
						))}

					<SelectItem value="__add_new__">
						+ Add new category…
					</SelectItem>
				</SelectContent>
			</Select>

			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add new category</DialogTitle>
					</DialogHeader>
					<div className="space-y-2">
						<Input
							autoFocus
							placeholder="Category name"
							value={newCategoryName}
							onChange={(e) => setNewCategoryName(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
						<Button onClick={handleAddCategory} disabled={isSubmitting || !newCategoryName.trim()}>Add</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}


