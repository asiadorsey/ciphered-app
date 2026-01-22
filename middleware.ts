import { NextRequest, NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

type UserRole = Database['public']['Tables']['users']['Row']['role'];

export async function middleware(request: NextRequest) {
  console.log('ENV CHECK:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('ANON KEY CHECK:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing');
  const { pathname } = request.nextUrl;
  const supabase = createClientFromRequest(request);

  // Get authenticated user
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

  // Get user role if authenticated
  let userRole: UserRole | null = null;
  if (authUser && !authError) {
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single();
    
    if (userData) {
      userRole = userData.role;
    }
  }

  const isAuthenticated = !!authUser && !!userRole;
  const isPublicRoute = pathname === '/login' || pathname === '/register';
  const isPARoute = pathname.startsWith('/pa');
  const isPCRoute = pathname.startsWith('/pc');
  const isRoot = pathname === '/';

  // Handle root path
  if (isRoot) {
    if (isAuthenticated) {
      // Redirect to appropriate dashboard based on role
      const dashboardPath = userRole === 'PA' ? '/pa' : '/pc';
      return NextResponse.redirect(new URL(dashboardPath, request.url));
    } else {
      // Redirect to login if not authenticated
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Handle public routes (login/register)
  if (isPublicRoute) {
    if (isAuthenticated) {
      // Redirect logged-in users to their dashboard
      const dashboardPath = userRole === 'PA' ? '/pa' : '/pc';
      return NextResponse.redirect(new URL(dashboardPath, request.url));
    }
    // Allow access to login/register for unauthenticated users
    return NextResponse.next();
  }

  // Handle protected routes
  if (isPARoute) {
    if (!isAuthenticated) {
      // Redirect unauthenticated users to login
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (userRole !== 'PA') {
      // Redirect non-PA users to their correct dashboard
      return NextResponse.redirect(new URL('/pc', request.url));
    }
    // Allow PA users to access PA routes
    return NextResponse.next();
  }

  if (isPCRoute) {
    if (!isAuthenticated) {
      // Redirect unauthenticated users to login
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (userRole !== 'PC') {
      // Redirect non-PC users to their correct dashboard
      return NextResponse.redirect(new URL('/pa', request.url));
    }
    // Allow PC users to access PC routes
    return NextResponse.next();
  }

  // Allow all other routes to pass through
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

