import { createClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import type { Database } from '@/lib/supabase/types';
import { PACalendar } from './pa-calendar';
import { PAShifts } from './pa-shifts';
import { PAProfile } from './pa-profile';
import { LogoutButton } from '../pc/logout-button';
import { PARealtimeSubscriptions } from './realtime-subscriptions';

type User = Database['public']['Tables']['users']['Row'];
type Availability = Database['public']['Tables']['availability']['Row'];
type Shift = Database['public']['Tables']['shifts']['Row'];

async function getPADashboardData(): Promise<{
    user: User;
    availability: Availability[];
    shifts: Shift[];
    dates: string[];
    startDate: string;
    endDate: string;
}> {
    const supabase = await createClient();

    // Get current authenticated user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !authUser) {
        throw new Error('Not authenticated. Please log in.');
    }

    // Get user record from users table
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .eq('role', 'PA')
        .single();

    if (userError || !userData) {
        throw new Error('User not found or not a PA.');
    }

    // Calculate date range (next 30 days)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 29); // 30 days total (today + 29 more)

    const startDateStr = today.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Fetch availability for next 30 days for this PA
    const { data: availability, error: availabilityError } = await supabase
        .from('availability')
        .select('*')
        .eq('user_id', authUser.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date');

    if (availabilityError) {
        throw new Error(`Failed to fetch availability: ${availabilityError.message}`);
    }

    // Fetch shifts for this PA (all shifts, not just next 30 days)
    const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .eq('assigned_pa_id', authUser.id)
        .order('date');

    if (shiftsError) {
        throw new Error(`Failed to fetch shifts: ${shiftsError.message}`);
    }

    // Generate date array for the next 30 days
    const dates: string[] = [];
    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
    }

    return {
        user: userData,
        availability: availability || [],
        shifts: shifts || [],
        dates,
        startDate: startDateStr,
        endDate: endDateStr,
    };
}

function LoadingState() {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading dashboard...</p>
            </div>
        </div>
    );
}

function ErrorDisplay({ error }: { error: Error }) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center p-8 bg-destructive/10 border border-destructive rounded-lg max-w-md">
                <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Dashboard</h2>
                <p className="text-muted-foreground">{error.message}</p>
            </div>
        </div>
    );
}

export default async function PADashboardPage() {
    let data: Awaited<ReturnType<typeof getPADashboardData>> | null = null;
    let error: Error | null = null;

    try {
        data = await getPADashboardData();
    } catch (e) {
        error = e instanceof Error ? e : new Error('Unknown error occurred');
    }

    if (error) {
        return <ErrorDisplay error={error} />;
    }

    if (!data) {
        return <LoadingState />;
    }

    // Format dates for display
    const formattedDates = data.dates.map((dateStr) => {
        const date = new Date(dateStr);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return {
            date: dateStr,
            display: `${dayName} ${month}/${day}`,
            dayName,
            day,
            month,
        };
    });

    // Calculate pending shifts count
    const pendingShiftsCount = data.shifts.filter(
        (shift) => shift.confirmation_status === 'pending'
    ).length;

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
            <PARealtimeSubscriptions />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-0">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold">Production Assistant Dashboard</h1>
                    <p className="text-muted-foreground mt-1 text-sm md:text-base">
                        Welcome back, {data.user.name}
                    </p>
                </div>
                <div className="self-start md:self-auto">
                    <LogoutButton />
                </div>
            </div>

            <div className="grid gap-6 md:gap-8 lg:grid-cols-3">
                {/* Calendar View - Takes 2 columns on large screens */}
                <div className="lg:col-span-2">
                    <Suspense fallback={<LoadingState />}>
                        <PACalendar
                            userId={data.user.id}
                            availability={data.availability}
                            dates={formattedDates}
                            startDate={data.startDate}
                            endDate={data.endDate}
                        />
                    </Suspense>
                </div>

                {/* My Shifts and Profile - Takes 1 column on large screens */}
                <div className="space-y-6 md:space-y-8">
                    <Suspense fallback={<LoadingState />}>
                        <PAShifts
                            userId={data.user.id}
                            shifts={data.shifts}
                            pendingCount={pendingShiftsCount}
                        />
                    </Suspense>

                    <Suspense fallback={<LoadingState />}>
                        <PAProfile
                            user={data.user}
                        />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}

