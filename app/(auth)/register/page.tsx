"use client";

import {
  useState,
  FormEvent,
  useRef,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { validateInviteCodeClient, generateInviteCode } from "@/lib/utils/inviteCode";

export type RoleType = "PA" | "PC";

const PASSWORD_STRENGTHS = [
  { label: "Weak", color: "bg-destructive" },
  { label: "Medium", color: "bg-yellow-400" },
  { label: "Strong", color: "bg-green-500" },
];

function getPasswordStrength(password: string): 0 | 1 | 2 {
  let strength = 0;
  if (password.length >= 6) strength++;
  if (/\d/.test(password) && /[a-zA-Z]/.test(password)) strength++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;
  if (strength === 1) return 0; // Weak
  if (strength === 2) return 1; // Medium
  if (strength > 2) return 2; // Strong
  return 0;
}

export default function RegisterPage() {
  const router = useRouter();

  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isSupabaseConfigured = supabaseUrl && supabaseAnonKey && 
    !supabaseUrl.includes('vqqehfnmuvvsrlsrhsbt'); // Check for placeholder/invalid URL

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<RoleType>("PA");
  const [projectCode, setProjectCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Validation and feedback state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Field-specific errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [projectCodeError, setProjectCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  const [showProjectCode, setShowProjectCode] = useState(false);

  // Password strength
  const passwordStrength = getPasswordStrength(password);

  // For input focusing on first error
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const projectCodeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  // Test connection function
  const testConnection = async () => {
    console.log('=== Testing Supabase Connection ===');
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    console.log('Key length:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0);
    
    try {
      const supabase = createClient();
      console.log('Client created successfully');
      
      // Test 1: Try to get the current session
      console.log('Test 1: Getting current session...');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log('Session test:', { hasSession: !!sessionData.session, error: sessionError });
      
      // Test 2: Try a simple query (if users table exists)
      console.log('Test 2: Testing database query...');
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1);
      
      console.log('Query test result:', { 
        dataCount: data?.length || 0, 
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        } : null
      });
      
      if (error) {
        console.error('Test error details:', error);
        alert(`Connection test completed with error: ${error.message}\n\nCheck console for full details.`);
      } else {
        console.log('Connection test successful!');
        alert('Connection test successful! Supabase client is working.\n\nCheck console for full details.');
      }
    } catch (err) {
      console.error('Test connection exception:', err);
      console.error('Exception stack:', err instanceof Error ? err.stack : 'No stack trace');
      alert(`Test failed: ${err instanceof Error ? err.message : 'Unknown error'}\n\nCheck console for details.`);
    }
  };

  function validateEmail(email: string): boolean {
    // Very basic email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  function validateForm(): boolean {
    let valid = true;
    setNameError(null);
    setEmailError(null);
    setProjectCodeError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);

    if (!name.trim()) {
      setNameError("Name is required");
      valid = false;
    }

    if (!email.trim()) {
      setEmailError("Email is required");
      valid = false;
    } else if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      valid = false;
    }

    // Only require project code (invite code) for PA role
    if (role === "PA" && !projectCode.trim()) {
      setProjectCodeError("Production Invite Code is required");
      valid = false;
    }

    if (!password) {
      setPasswordError("Password is required");
      valid = false;
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      valid = false;
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your password");
      valid = false;
    } else if (confirmPassword !== password) {
      setConfirmPasswordError("Passwords do not match");
      valid = false;
    }

    return valid;
  }

  // Real-time field-level validation
  useEffect(() => {
    if (!name.trim()) setNameError(null);
    else setNameError(null);

    if (!email) setEmailError(null);
    else if (!validateEmail(email)) setEmailError("Please enter a valid email address");
    else setEmailError(null);

    // Only validate project code for PA role
    if (role === "PA") {
      if (!projectCode.trim()) setProjectCodeError(null);
      else setProjectCodeError(null);
    } else {
      setProjectCodeError(null);
    }

    if (!password) setPasswordError(null);
    else if (password.length < 6) setPasswordError("Password must be at least 6 characters");
    else setPasswordError(null);

    if (!confirmPassword) setConfirmPasswordError(null);
    else if (confirmPassword !== password) setConfirmPasswordError("Passwords do not match");
    else setConfirmPasswordError(null);
  }, [name, email, projectCode, password, confirmPassword, role]);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const isValid = validateForm();
    if (!isValid) {
      // Focus on the first error field
      if (nameError && nameRef.current) nameRef.current.focus();
      else if (emailError && emailRef.current) emailRef.current.focus();
      else if (projectCodeError && projectCodeRef.current) projectCodeRef.current.focus();
      else if (passwordError && passwordRef.current) passwordRef.current.focus();
      else if (confirmPasswordError && confirmPasswordRef.current) confirmPasswordRef.current.focus();
      return;
    }

    setIsLoading(true);

    // For PA role: Validate invite code before proceeding
    let productionId: string | undefined;
    if (role === "PA") {
      const validation = await validateInviteCodeClient(projectCode.trim());
      if (!validation.valid) {
        setProjectCodeError("Invalid or expired invite code");
        setIsLoading(false);
        if (projectCodeRef.current) projectCodeRef.current.focus();
        return;
      }
      productionId = validation.productionId;
    }

    // Debug: Log environment variables before creating client
    console.log('Attempting signup with URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    console.log('Key length:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0);
    console.log('Key first 10 chars:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 10) || 'undefined');

    let supabase;
    try {
      supabase = createClient();
      console.log('Supabase client created successfully');
    } catch (clientError) {
      console.error('Error creating Supabase client:', clientError);
      const errorMessage = clientError instanceof Error ? clientError.message : 'Failed to initialize Supabase client';
      if (errorMessage.includes('Missing Supabase environment variables')) {
        setError(
          'Missing Supabase configuration. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local'
        );
      } else {
        setError(errorMessage);
      }
      setIsLoading(false);
      return;
    }

    // 1) Sign up in Auth
    console.log('Calling supabase.auth.signUp...');
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    console.log('SignUp response:', { 
      hasData: !!data, 
      hasUser: !!data?.user,
      error: signUpError ? {
        message: signUpError.message,
        status: signUpError.status,
        name: signUpError.name
      } : null
    });

    if (signUpError) {
      console.error('SignUp error details:', signUpError);
      // Check for common connection errors
      if (signUpError.message.includes('ERR_NAME_NOT_RESOLVED') || 
          signUpError.message.includes('fetch failed') ||
          signUpError.message.includes('Failed to fetch')) {
        setError(
          "Cannot connect to Supabase. Please check that your NEXT_PUBLIC_SUPABASE_URL in .env.local is correct and points to a valid Supabase project."
        );
      } else {
        setError(signUpError.message);
      }
      setIsLoading(false);
      return;
    }

    const user = data.user;

    if (!user) {
      setError("Unexpected error during sign up.");
      setIsLoading(false);
      return;
    }

    // 2) Insert to users table with production_id for PA users
    const userInsertData: any = {
      id: user.id,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      role: role,
    };

    // Set production_id for PA users (from validated invite code)
    // PC users don't get production_id - it stays NULL until they create a production
    if (role === "PA" && productionId) {
      userInsertData.production_id = productionId;
    }

    const { error: tableError } = await supabase
      .from("users")
      .insert(userInsertData);

    if (tableError) {
      // Check for connection errors
      if (tableError.message.includes('ERR_NAME_NOT_RESOLVED') || 
          tableError.message.includes('fetch failed') ||
          tableError.message.includes('Failed to fetch')) {
        setError(
          "Cannot connect to Supabase database. Please check that your NEXT_PUBLIC_SUPABASE_URL in .env.local is correct and points to a valid Supabase project."
        );
      } else {
        setError(
          tableError.message ||
            "Error saving account. Please contact support."
        );
      }
      setIsLoading(false);
      return;
    }

    // 3) Try to sign in automatically
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setSuccess(
        "Account created! Please log in."
      );
      setIsLoading(false);
      router.push("/login");
      return;
    }

    setSuccess("Registration successful!");

    // 4) Redirect based on role and production status
    if (role === "PA") {
      // PA users always go to /pa dashboard
      setTimeout(() => {
        router.replace("/pa");
      }, 1000);
    } else {
      // PC users: Check if they have a production_id
      const { data: userData, error: fetchError } = await supabase
        .from("users")
        .select("production_id")
        .eq("id", user.id)
        .single();

      setTimeout(() => {
        if (fetchError || !userData) {
          // If we can't fetch, default to /pc/create-production
          router.replace("/pc/create-production");
        } else if (userData.production_id) {
          // User has a production_id, go to dashboard
          router.replace("/pc");
        } else {
          // User doesn't have a production_id, go to create production
          router.replace("/pc/create-production");
        }
      }, 1000);
    }

    setIsLoading(false);
  }

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
    <div className="min-h-screen flex items-center justify-center bg-muted px-2">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Sign Up</CardTitle>
          <CardDescription>
            Create your account to get started.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister} autoComplete="off">
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/10 px-4 py-2 text-destructive mb-2 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md bg-green-100 px-4 py-2 text-green-700 mb-2 text-sm">
                {success}
              </div>
            )}

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                autoFocus
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Your Full Name"
                value={name}
                onChange={e => setName(e.target.value)}
                ref={nameRef}
                disabled={isLoading}
                aria-invalid={!!nameError}
                className={nameError ? "border-destructive" : ""}
              />
              {nameError && (
                <p className="text-sm text-destructive">{nameError}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                ref={emailRef}
                disabled={isLoading}
                aria-invalid={!!emailError}
                className={emailError ? "border-destructive" : ""}
              />
              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}
            </div>

            {/* Phone (optional) */}
            <div className="space-y-2">
              <Label htmlFor="phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="(555) 555-5555"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={role}
                onValueChange={(val) => {
                  setRole(val as RoleType);
                  // Clear project code when switching roles
                  if (val === "PC") {
                    setProjectCode("");
                    setProjectCodeError(null);
                  }
                }}
                disabled={isLoading}
              >
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PA">Production Assistant (PA)</SelectItem>
                  <SelectItem value="PC">Production Coordinator (PC)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Project Code - Only for PA role */}
            {role === "PA" && (
              <div className="space-y-2">
                <Label htmlFor="projectCode">Production Invite Code</Label>
                <div className="relative">
                  <Input
                    id="projectCode"
                    name="projectCode"
                    type={showProjectCode ? "text" : "password"}
                    placeholder="Enter code"
                    value={projectCode}
                    onChange={e => setProjectCode(e.target.value)}
                    ref={projectCodeRef}
                    disabled={isLoading}
                    aria-invalid={!!projectCodeError}
                    className={`pr-10 ${projectCodeError ? "border-destructive" : ""}`}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowProjectCode(!showProjectCode)}
                    disabled={isLoading}
                    aria-label={showProjectCode ? "Hide project code" : "Show project code"}
                  >
                    {showProjectCode ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">Enter the code provided by production</p>
                {projectCodeError && (
                  <p className="text-sm text-destructive">{projectCodeError}</p>
                )}
              </div>
            )}

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                ref={passwordRef}
                disabled={isLoading}
                aria-invalid={!!passwordError}
                className={passwordError ? "border-destructive" : ""}
              />
              {/* Strength indicator */}
              {password && (
                <div className="flex items-center space-x-2 mt-1">
                  <div className="w-24 h-2 rounded bg-muted-foreground/10 overflow-hidden">
                    <div
                      className={`h-2 rounded transition-all duration-200 ${
                        passwordStrength === 0
                          ? "w-1/3 bg-destructive"
                          : passwordStrength === 1
                          ? "w-2/3 bg-yellow-400"
                          : "w-full bg-green-500"
                      }`}
                    />
                  </div>
                  <span className={`text-xs ${
                    passwordStrength === 0
                      ? "text-destructive"
                      : passwordStrength === 1
                      ? "text-yellow-700"
                      : "text-green-700"
                  }`}>
                    {
                      PASSWORD_STRENGTHS[passwordStrength].label
                    }
                  </span>
                </div>
              )}
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                ref={confirmPasswordRef}
                disabled={isLoading}
                aria-invalid={!!confirmPasswordError}
                className={confirmPasswordError ? "border-destructive" : ""}
              />
              {confirmPasswordError && (
                <p className="text-sm text-destructive">{confirmPasswordError}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="mr-2">Signing up...</span>
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>
                </>
              ) : (
                "Sign Up"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={testConnection}
              disabled={isLoading}
              className="w-full"
            >
              Test Supabase Connection
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

