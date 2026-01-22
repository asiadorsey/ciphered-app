import { createClient } from '@/lib/supabase/server';
import { AvailabilityGrid } from './availability-grid';
import { ProductionInfoCard } from './production-info-card';
import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogoutButton } from './logout-button';
import { PCRealtimeSubscriptions } from './realtime-subscriptions';
import type { Database } from '@/lib/supabase/types';

type PA = Database['public']['Tables']['users']['Row'];
type Availability = Database['public']['Tables']['availability']['Row'];
type Shift = Database['public']['Tables']['shifts']['Row'];
type Production = Database['public']['Tables']['productions']['Row'];

// Helper function to get Monday of a given week
function getMondayOfWeek(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
}

// Helper function to get Sunday of a given week
function getSundayOfWeek(date: Date): Date {
    const monday = getMondayOfWeek(date);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(0, 0, 0, 0); // Ensure time is set to midnight to match Monday
    return sunday;
}

// Helper function to format date as YYYY-MM-DD using local timezone (avoiding UTC conversion issues)
function formatDateLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper function to generate dates for a week (Mon-Sun)
// Uses ISO format to match what PA calendar uses when saving dates
function generateWeekDates(monday: Date): string[] {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        // Use ISO string format to match PA calendar date format
        dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
}

async function getDashboardData() {
    const supabase = await createClient();

    // Get current authenticated user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !authUser) {
        throw new Error('Not authenticated. Please log in.');
    }

    // Get current PC's user record to verify role
    const { data: pcUserData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .single();

    // Graceful error handling: allow access if user exists
    if (userError) {
        // If it's a "not found" error, throw
        if (userError.code === 'PGRST116') {
            throw new Error('User not found in database.');
        }
        // For other errors, log but allow access for backward compatibility
        console.warn('Error fetching user data:', userError.message);
    }

    // Verify user is a PC
    if (pcUserData && pcUserData.role !== 'PC') {
        throw new Error('Access denied. This dashboard is for PC users only.');
    }

    // Fetch production data for current user (needed to filter PAs)
    const { data: production, error: productionError } = await supabase
        .from('productions')
        .select('*')
        .eq('created_by', authUser.id)
        .maybeSingle();

    // If there's an error and it's not a "not found" error, log it but continue
    if (productionError && productionError.code !== 'PGRST116') {
        console.warn('Error fetching production:', productionError.message);
    }

    // Calculate current week (Monday-Sunday)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentWeekMonday = getMondayOfWeek(today);
    const currentWeekSunday = getSundayOfWeek(today);

    // Fetch data for a wider range (current week ± 2 weeks) to allow navigation
    const startDate = new Date(currentWeekMonday);
    startDate.setDate(currentWeekMonday.getDate() - 14); // 2 weeks before
    const endDate = new Date(currentWeekSunday);
    endDate.setDate(currentWeekSunday.getDate() + 14); // 2 weeks after

    // Use ISO string format to match what PA calendar uses when saving dates
    // This ensures consistency with existing data in the database
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Build query for PAs - filter by production_id if production exists
    let pasQuery = supabase
        .from('users')
        .select('*')
        .eq('role', 'PA');
    
    // Only filter by production_id if the PC has a production
    if (production?.id) {
        pasQuery = pasQuery.eq('production_id', production.id);
    }

    // Fetch PAs with production_id filter
    const { data: pas, error: pasError } = await pasQuery.order('name');

    if (pasError) {
        throw new Error(`Failed to fetch PAs: ${pasError.message}`);
    }

    // Extract PA IDs to filter availability and shifts by production
    const paIds = (pas || []).map(pa => pa.id);

    // Fetch availability for the date range, filtered by PA user_ids in this production
    let availability;
    
    // If no PAs, return empty array to ensure no availability is shown
    if (paIds.length === 0) {
        availability = [];
    } else {
        const { data, error: availabilityError } = await supabase
            .from('availability')
            .select('*')
            .gte('date', startDateStr)
            .lte('date', endDateStr)
            .in('user_id', paIds);

        if (availabilityError) {
            throw new Error(`Failed to fetch availability: ${availabilityError.message}`);
        }
        
        availability = data || [];
    }

    // Fetch shifts for the date range, filtered by assigned_pa_ids in this production
    let shifts;
    
    // If no PAs, return empty array to ensure no shifts are shown
    if (paIds.length === 0) {
        shifts = [];
    } else {
        const { data, error: shiftsError } = await supabase
            .from('shifts')
            .select('*')
            .gte('date', startDateStr)
            .lte('date', endDateStr)
            .in('assigned_pa_id', paIds);

        if (shiftsError) {
            throw new Error(`Failed to fetch shifts: ${shiftsError.message}`);
        }
        
        shifts = data || [];
    }

    // Generate dates for current week (Mon-Sun) - use ISO format to match PA calendar
    const currentWeekDates = generateWeekDates(currentWeekMonday);
    const currentWeekMondayStr = currentWeekMonday.toISOString().split('T')[0];

    // Count PAs in the production (if production exists)
    let paCount = 0;
    if (production) {
        const { count, error: countError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('production_id', production.id)
            .eq('role', 'PA');

        if (!countError && count !== null) {
            paCount = count;
        }
    }

    return {
        pas: pas || [],
        availability: availability || [],
        shifts: shifts || [],
        currentWeekMonday: currentWeekMondayStr, // Use ISO format to match database
        currentWeekDates,
        production: production || null,
        paCount,
    };
}

function LoadingState() {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading dashboard data...</p>
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

export default async function PCDashboardPage() {
    let data;
    let error: Error | null = null;

    try {
        data = await getDashboardData();
    } catch (e) {
        error = e instanceof Error ? e : new Error('Unknown error occurred');
    }

    if (error) {
        return <ErrorDisplay error={error} />;
    }

    if (!data) {
        return <LoadingState />;
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <PCRealtimeSubscriptions />
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">PC Dashboard</h1>
                    {data.production ? (
                        <p className="text-muted-foreground text-sm mt-1">
                            Production: {data.production.name}
                        </p>
                    ) : (
                        <p className="text-muted-foreground text-sm mt-1">
                            No production found. Create a production to manage your PA team.
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/pc/daily-overview">
                        <Button>Daily Overview</Button>
                    </Link>
                    <LogoutButton />
                </div>
            </div>

            {/* Production Info Card */}
            <ProductionInfoCard production={data.production} paCount={data.paCount} />

            <Suspense fallback={<LoadingState />}>
                <AvailabilityGrid
                    pas={data.pas}
                    availability={data.availability}
                    shifts={data.shifts}
                    initialWeekMonday={data.currentWeekMonday}
                />
            </Suspense>
        </div>
    );
}

