import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { animated } from "@react-spring/web";
import { useGesture } from "@use-gesture/react";
import { Trash2 } from "lucide-react";
import { CategoryForm } from "@/components/CategoryForm";

type CategoryDoc = {
  _id: Id<"categories">;
  name: string;
  transactionType?: string;
};

export default function CategoriesManager({ type }: { type: "expense" | "income" }) {
  const { toast } = useToast();
  const categories = (useQuery(api.expenses.getCategoriesWithIds) as CategoryDoc[] | undefined) ?? [];
  const updateCategories = useMutation(api.expenses.updateCategories);

  const [screenWidth, setScreenWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 375);
  const swipePositions = useRef<Record<string, number>>({});
  const [swipeStates, setSwipeStates] = useState<Record<string, number>>({});

  const [editingCategory, setEditingCategory] = useState<CategoryDoc | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const filtered = useMemo(
    () => categories.filter(c => (c.transactionType ?? "expense") === type),
    [categories, type]
  );
  const sortedCategories = useMemo(
    () => filtered.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [filtered]
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
          handleDelete(id as Id<'categories'>);
        }
        swipePositions.current[id] = 0;
        setSwipeStates(prev => ({ ...prev, [id]: 0 }));
      }
    }
  });

  const handleDelete = async (id: Id<'categories'>) => {
    try {
      // Remove by recomputing the list without this category
      const next = categories
        .filter(c => c._id !== id)
        .map(c => ({ _id: c._id, name: c.name, transactionType: c.transactionType ?? "expense" }));  // ✅ Preserve IDs
      await updateCategories({ categories: next });
      toast({ title: "Success", description: "Category deleted" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete category" });
    }
  };

  return (
    <div className="grid gap-3">
      {sortedCategories.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">No categories found.</CardContent>
        </Card>
      ) : (
        sortedCategories.map((cat) => (
          <div key={cat._id as string} className="relative">
            <div
              className="absolute inset-0 flex items-center justify-end pr-6 bg-red-500 text-white"
              style={{ opacity: getDeleteZoneProgress(swipeStates[cat._id as string] || 0) }}
            >
              <Trash2 size={24} />
            </div>
            <animated.div
              {...bindSwipe(cat._id)}
              style={{
                transform: `translateX(${swipeStates[cat._id as string] || 0}px)`,
                touchAction: "pan-y",
              }}
            >
              <Card
                onClick={() => { setEditingCategory(cat); setIsEditDialogOpen(true); }}
                className="relative shadow-sm cursor-pointer"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{cat.name}</div>
                    <Badge variant="secondary" className="text-xs">
                      {type === "expense" ? "Expense" : "Income"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </animated.div>
          </div>
        ))
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if (!open) { setIsEditDialogOpen(false); setEditingCategory(null); } }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md p-4 rounded-xl border bg-card text-card-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <CategoryForm
              transactionType={type}
              initialData={{ id: editingCategory._id, name: editingCategory.name }}
              onSuccess={() => { setIsEditDialogOpen(false); setEditingCategory(null); }}
              onCancel={() => { setIsEditDialogOpen(false); setEditingCategory(null); }}
              renderActions={({ handleSubmit }) => (
                <div className="flex items-center justify-between mt-2">
                  <Button
                    variant="destructive"
                    type="button"
                    onClick={async () => {
                      if (!editingCategory) return;
                      await handleDelete(editingCategory._id);
                      setIsEditDialogOpen(false);
                      setEditingCategory(null);
                    }}
                  >
                    Delete
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => { setIsEditDialogOpen(false); setEditingCategory(null); }}
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


