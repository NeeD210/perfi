import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface PaymentTypeRecord {
	_id: Id<"paymentTypes">;
	name: string;
	isCredit?: boolean;
}

interface PaymentTypeSelectWithCreateProps {
	value: Id<"paymentTypes"> | "" | string;
	onChange: (value: Id<"paymentTypes"> | "") => void;
	disabled?: boolean;
}

export default function PaymentTypeSelectWithCreate({ value, onChange, disabled }: PaymentTypeSelectWithCreateProps) {
	const { toast } = useToast();
	const paymentTypes = (useQuery(api.expenses.getPaymentTypes) as PaymentTypeRecord[] | undefined) ?? [];
	const updatePaymentTypes = useMutation(api.expenses.updatePaymentTypes);

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [newName, setNewName] = useState("");
	const [isCredit, setIsCredit] = useState(false);
	const [closingDay, setClosingDay] = useState("");
	const [dueDay, setDueDay] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [pendingNewId, setPendingNewId] = useState<Id<"paymentTypes"> | null>(null);

	const sortedPaymentTypes = useMemo(() => paymentTypes.slice().sort((a, b) => a.name.localeCompare(b.name)), [paymentTypes]);

	const handleAdd = useCallback(async () => {
		const name = newName.trim();
		if (!name) {
			toast({ title: "Invalid name", description: "Please enter a payment type name." });
			return;
		}

		// Validate credit card fields when needed
		if (isCredit) {
			const closingDayNum = parseInt(closingDay);
			const dueDayNum = parseInt(dueDay);
			if (isNaN(closingDayNum) || isNaN(dueDayNum)) {
				toast({ title: "Invalid values", description: "Closing day and due day must be numbers" });
				return;
			}
			if (closingDayNum < 1 || closingDayNum > 31 || dueDayNum < 1 || dueDayNum > 31) {
				toast({ title: "Invalid range", description: "Closing day and due day must be between 1 and 31" });
				return;
			}
		}
		setIsSubmitting(true);
		try {
			// Add new payment type to existing list using updatePaymentTypes
			const updatedPaymentTypes = [
				...paymentTypes.map(pt => ({
					_id: pt._id,  // ✅ Preserve IDs
					name: pt.name,
					isCredit: pt.isCredit ?? false,
					closingDay: pt.closingDay,
					dueDay: pt.dueDay,
				})),
				{
					// No _id for new payment type
					name,
					isCredit,
					closingDay: isCredit ? parseInt(closingDay) : undefined,
					dueDay: isCredit ? parseInt(dueDay) : undefined,
				},
			];
			
			await updatePaymentTypes({
				paymentTypes: updatedPaymentTypes,
			});
			
			// Find the newly created payment type by name
			// Wait a moment for the query to update
			setTimeout(() => {
				const newType = paymentTypes.find(pt => pt.name === name);
				if (newType) {
					setPendingNewId(newType._id);
				}
			}, 100);
			
			setIsDialogOpen(false);
			setNewName("");
			setIsCredit(false);
			setClosingDay("");
			setDueDay("");
			toast({ title: "Payment type added", description: "New payment type created." });
		} catch (err: any) {
			toast({ title: "Error", description: err?.message ?? "Failed to add payment type" });
		} finally {
			setIsSubmitting(false);
		}
	}, [updatePaymentTypes, paymentTypes, newName, isCredit, closingDay, dueDay, toast]);

	useEffect(() => {
		if (pendingNewId) {
			onChange(pendingNewId);
			setPendingNewId(null);
		}
	}, [onChange, pendingNewId]);

	return (
		<>
			<Select
				value={value as string}
				onValueChange={(val) => {
					if (val === "__add_new__") {
						setIsDialogOpen(true);
						return;
					}
					onChange(val as Id<"paymentTypes">);
				}}
				disabled={disabled}
			>
				<SelectTrigger>
					<SelectValue placeholder="Select payment type" />
				</SelectTrigger>
				<SelectContent>
					{sortedPaymentTypes.map((pt) => (
						<SelectItem key={pt._id as string} value={pt._id as string}>
							<div className="flex items-center gap-2">
								<span>{pt.name}</span>
								{pt.isCredit ? (
									<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Credit</span>
								) : (
									<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Debit</span>
								)}
							</div>
						</SelectItem>
					))}

					<SelectItem value="__add_new__">+ Add new payment type…</SelectItem>
				</SelectContent>
			</Select>

			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add new payment type</DialogTitle>
					</DialogHeader>
					<div className="space-y-2">
						<Input
							autoFocus
							placeholder="Payment type name"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
						/>
					</div>
					<div className="flex items-center space-x-2 mt-2">
						<Checkbox
							id="isCredit"
							checked={isCredit}
							onCheckedChange={(checked: boolean | "indeterminate") => setIsCredit(checked === true)}
						/>
						<Label htmlFor="isCredit" className="text-sm font-normal">This is a credit card</Label>
					</div>
					{isCredit && (
						<div className="grid grid-cols-2 gap-4 mt-2">
							<div className="space-y-2">
								<Label htmlFor="closingDay">Closing Day (1-31)</Label>
								<Input
									id="closingDay"
									type="number"
									value={closingDay}
									onChange={(e) => setClosingDay(e.target.value)}
									min="1"
									max="31"
									className="h-10"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="dueDay">Due Day (1-31)</Label>
								<Input
									id="dueDay"
									type="number"
									value={dueDay}
									onChange={(e) => setDueDay(e.target.value)}
									min="1"
									max="31"
									className="h-10"
								/>
							</div>
						</div>
					)}
					<DialogFooter>
						<Button variant="ghost" onClick={() => { setIsDialogOpen(false); setNewName(""); setIsCredit(false); setClosingDay(""); setDueDay(""); }} disabled={isSubmitting}>Cancel</Button>
						<Button onClick={handleAdd} disabled={isSubmitting || !newName.trim()}>Add</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}


