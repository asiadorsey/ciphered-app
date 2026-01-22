"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Production = Database['public']['Tables']['productions']['Row'];

interface ProductionInfoCardProps {
  production: Production | null;
  paCount: number;
}

export function ProductionInfoCard({ production, paCount }: ProductionInfoCardProps) {
  const [isActive, setIsActive] = useState(production?.is_active ?? false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync state when production prop changes
  useEffect(() => {
    if (production) {
      setIsActive(production.is_active);
    }
  }, [production]);

  // If no production exists, show create button
  if (!production) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Production Found</CardTitle>
          <CardDescription>
            Create your first production to get started managing your PA team.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/pc/create-production">
            <Button>Create Your First Production</Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(production.invite_code);
      toast.success("Invite code copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy invite code. Please copy manually.");
    }
  };

  const handleToggleActive = async (checked: boolean | "indeterminate") => {
    if (checked === "indeterminate" || !production) return;
    
    setIsUpdating(true);
    const previousState = isActive;
    
    // Optimistically update UI
    setIsActive(checked);
    
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("productions")
        .update({ is_active: checked })
        .eq("id", production.id);

      if (error) {
        throw error;
      }

      toast.success(`Production ${checked ? "activated" : "deactivated"}`);
    } catch (error) {
      console.error("Error updating production status:", error);
      toast.error("Failed to update production status");
      // Revert the checkbox state on error
      setIsActive(previousState);
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{production.name}</CardTitle>
            <CardDescription>Production Information</CardDescription>
          </div>
          <Link href="/pc/create-production">
            <Button variant="outline" size="sm">
              Edit Production
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invite Code Section */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Invite Code</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 bg-muted rounded-md border font-mono text-lg font-semibold text-center">
              {production.invite_code}
            </div>
            <Button onClick={handleCopyCode} variant="outline" size="sm">
              Copy
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Share this code with your PA team
          </p>
        </div>

        {/* Dates Section */}
        {(production.start_date || production.end_date) && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Production Dates</label>
            <div className="text-sm space-y-1">
              {production.start_date && (
                <div>
                  <span className="text-muted-foreground">Start: </span>
                  <span>{formatDate(production.start_date)}</span>
                </div>
              )}
              {production.end_date && (
                <div>
                  <span className="text-muted-foreground">End: </span>
                  <span>{formatDate(production.end_date)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PA Count */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Team Members</label>
          <div className="text-sm">
            <span className="text-muted-foreground">PAs in production: </span>
            <span className="font-semibold">{paCount}</span>
          </div>
        </div>

        {/* Status Toggle */}
        <div className="flex items-center space-x-2 pt-2">
          <Checkbox
            id="production-status"
            checked={isActive}
            onCheckedChange={handleToggleActive}
            disabled={isUpdating}
          />
          <label
            htmlFor="production-status"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Production Active
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

