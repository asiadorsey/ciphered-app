"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export default function LoginPage() {
    const router = useRouter();
    
    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const isSupabaseConfigured = supabaseUrl && supabaseAnonKey && 
        !supabaseUrl.includes('vqqehfnmuvvsrlsrhsbt'); // Check for placeholder/invalid URL
    
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const validateForm = (): boolean => {
        let isValid = true;
        setEmailError(null);
        setPasswordError(null);

        if (!email.trim()) {
            setEmailError("Email is required");
            isValid = false;
        } else if (!validateEmail(email)) {
            setEmailError("Please enter a valid email address");
            isValid = false;
        }

        if (!password) {
            setPasswordError("Password is required");
            isValid = false;
        } else if (password.length < 6) {
            setPasswordError("Password must be at least 6 characters");
            isValid = false;
        }

        return isValid;
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);

        if (!validateForm()) {
            return;
        }

        setIsLoading(true);

        try {
            const supabase = createClient();

            // Sign in with email and password
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password,
            });

            if (authError) {
                // Check for common connection errors
                if (authError.message.includes('ERR_NAME_NOT_RESOLVED') || 
                    authError.message.includes('fetch failed') ||
                    authError.message.includes('Failed to fetch')) {
                    setError(
                        "Cannot connect to Supabase. Please check that your NEXT_PUBLIC_SUPABASE_URL in .env.local is correct and points to a valid Supabase project."
                    );
                } else {
                    setError(authError.message || "Invalid email or password");
                }
                setIsLoading(false);
                return;
            }

            if (!authData.user) {
                setError("Authentication failed. Please try again.");
                setIsLoading(false);
                return;
            }

            // Fetch user role from users table
            const { data: userData, error: userError } = await supabase
                .from("users")
                .select("role")
                .eq("id", authData.user.id)
                .single();

            if (userError || !userData) {
                setError("User profile not found. Please contact support.");
                setIsLoading(false);
                return;
            }

            // Type assertion for userData with role
            type UserRole = Database["public"]["Tables"]["users"]["Row"]["role"];
            const userRole = (userData as { role: UserRole }).role;

            // Redirect based on role
            if (userRole === "PA") {
                router.push("/pa");
            } else if (userRole === "PC") {
                router.push("/pc");
            } else {
                setError("Unknown user role. Please contact support.");
                setIsLoading(false);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
            // Check for common connection errors
            if (errorMessage.includes('ERR_NAME_NOT_RESOLVED') || 
                errorMessage.includes('fetch failed') ||
                errorMessage.includes('Failed to fetch') ||
                errorMessage.includes('Missing Supabase environment variables')) {
                setError(
                    "Cannot connect to Supabase. Please check that your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local are correct and point to a valid Supabase project."
                );
            } else {
                setError(errorMessage);
            }
            setIsLoading(false);
        }
    };

    // Show setup instructions if Supabase is not configured
    if (!isSupabaseConfigured) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted px-2">
                <Card className="w-full max-w-lg">
                    <CardHeader>
                        <CardTitle className="text-2xl text-destructive">Supabase Setup Required</CardTitle>
                        <CardDescription>
                            Please configure your Supabase project before using this application.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm">
                            <p className="font-semibold text-yellow-800 mb-2">Quick Setup Steps:</p>
                            <ol className="list-decimal list-inside space-y-2 text-yellow-700">
                                <li>Go to <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">https://app.supabase.com</a></li>
                                <li>Sign in or create a new account</li>
                                <li>Create a <strong>new project</strong> if you haven't already</li>
                                <li>Once your project is ready, go to <strong>Settings → API</strong></li>
                                <li>Copy your <strong>Project URL</strong> and <strong>anon/public key</strong></li>
                                <li>Create a file named <code className="bg-yellow-100 px-1 py-0.5 rounded">.env.local</code> in the project root</li>
                                <li>Add these lines to <code className="bg-yellow-100 px-1 py-0.5 rounded">.env.local</code>:</li>
                            </ol>
                            <div className="mt-3 bg-gray-900 text-green-400 p-3 rounded font-mono text-xs overflow-x-auto">
                                <div>NEXT_PUBLIC_SUPABASE_URL=your-project-url</div>
                                <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key</div>
                            </div>
                            <p className="mt-3 text-yellow-700 text-xs">
                                <strong>Important:</strong> Replace <code className="bg-yellow-100 px-1 py-0.5 rounded">your-project-url</code> and <code className="bg-yellow-100 px-1 py-0.5 rounded">your-anon-key</code> with your actual values from Supabase.
                            </p>
                            <p className="mt-2 text-yellow-700 text-xs">
                                After updating <code className="bg-yellow-100 px-1 py-0.5 rounded">.env.local</code>, restart your development server for the changes to take effect.
                            </p>
                        </div>
                        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
                            <p className="font-semibold text-blue-800 mb-1">Need Help?</p>
                            <p className="text-blue-700 text-xs">
                                Make sure you're using your actual Supabase project URL (not a placeholder or deleted project). 
                                The URL should look like: <code className="bg-blue-100 px-1 py-0.5 rounded">https://xxxxx.supabase.co</code>
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            variant="outline"
                            onClick={() => window.location.reload()}
                            className="w-full"
                        >
                            I've Updated .env.local - Refresh Page
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Sign In</CardTitle>
                    <CardDescription>
                        Enter your credentials to access your account
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setEmailError(null);
                                    setError(null);
                                }}
                                disabled={isLoading}
                                aria-invalid={!!emailError}
                                className={emailError ? "border-destructive" : ""}
                            />
                            {emailError && (
                                <p className="text-sm text-destructive">{emailError}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setPasswordError(null);
                                    setError(null);
                                }}
                                disabled={isLoading}
                                aria-invalid={!!passwordError}
                                className={passwordError ? "border-destructive" : ""}
                            />
                            {passwordError && (
                                <p className="text-sm text-destructive">{passwordError}</p>
                            )}
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="remember"
                                checked={rememberMe}
                                onCheckedChange={(checked) => setRememberMe(checked === true)}
                                disabled={isLoading}
                            />
                            <Label
                                htmlFor="remember"
                                className="text-sm font-normal cursor-pointer"
                            >
                                Remember me
                            </Label>
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-4">
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <span className="mr-2">Signing in...</span>
                                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>
                                </>
                            ) : (
                                "Sign In"
                            )}
                        </Button>
                        <p className="text-sm text-center text-muted-foreground">
                            Don't have an account?{" "}
                            <Link
                                href="/register"
                                className="text-primary hover:underline font-medium"
                            >
                                Sign up
                            </Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}

