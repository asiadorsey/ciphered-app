"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateInviteCode } from "@/lib/utils/inviteCode";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function CreateProductionPage() {
  const router = useRouter();
  const [productionName, setProductionName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [createdProduction, setCreatedProduction] = useState<{ id: string; inviteCode: string; name: string } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNameError(null);

    // Validate form
    if (!productionName.trim()) {
      setNameError("Production name is required");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      // Get current authenticated user
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

      if (authError || !authUser) {
        toast.error("You must be logged in to create a production");
        setIsLoading(false);
        return;
      }

      // Generate invite code
      const inviteCode = generateInviteCode();

      // Prepare production data
      const productionData: {
        name: string;
        invite_code: string;
        created_by: string;
        start_date?: string;
        end_date?: string;
        is_active: boolean;
      } = {
        name: productionName.trim(),
        invite_code: inviteCode,
        created_by: authUser.id,
        is_active: true,
      };

      // Add optional dates if provided
      if (startDate) {
        productionData.start_date = startDate;
      }
      if (endDate) {
        productionData.end_date = endDate;
      }

      // Insert production into database
      const { data, error } = await supabase
        .from("productions")
        .insert(productionData)
        .select("id")
        .single();

      if (error) {
        console.error("Error creating production:", error);
        toast.error(`Failed to create production: ${error.message}`);
        setIsLoading(false);
        return;
      }

      // Success - show the created production with invite code
      setCreatedProduction({
        id: data.id,
        inviteCode,
        name: productionName.trim(),
      });

      toast.success("Production created successfully!");
    } catch (error) {
      console.error("Exception creating production:", error);
      toast.error(`Failed to create production: ${error instanceof Error ? error.message : "Unknown error"}`);
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!createdProduction) return;

    try {
      await navigator.clipboard.writeText(createdProduction.inviteCode);
      toast.success("Invite code copied to clipboard!");
      
      // Redirect to PC dashboard after copy
      setTimeout(() => {
        router.push("/pc");
      }, 1000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy invite code. Please copy manually.");
    }
  };

  // Show success state with invite code
  if (createdProduction) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Production Created Successfully!</CardTitle>
            <CardDescription>
              Your production "{createdProduction.name}" has been created.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Invite Code</Label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={createdProduction.inviteCode}
                  readOnly
                  className="font-mono text-lg font-semibold text-center"
                />
                <Button onClick={handleCopyCode} type="button">
                  Copy Code
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Share this code with PAs to allow them to join this production.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={() => router.push("/pc")} variant="outline" className="w-full">
              Go to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Show form
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create New Production</CardTitle>
          <CardDescription>
            Create a new production and generate an invite code for PAs to join.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="productionName">
                Production Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="productionName"
                type="text"
                value={productionName}
                onChange={(e) => {
                  setProductionName(e.target.value);
                  setNameError(null);
                }}
                placeholder="Enter production name"
                className={nameError ? "border-destructive" : ""}
              />
              {nameError && (
                <p className="text-sm text-destructive">{nameError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date (Optional)</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date (Optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/pc")}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Production"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

