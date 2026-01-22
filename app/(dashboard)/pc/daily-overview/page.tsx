import { createClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import type { Database } from '@/lib/supabase/types';
import { DailyOverviewClient } from './daily-overview-client';

type PA = Database['public']['Tables']['users']['Row'];
type Shift = Database['public']['Tables']['shifts']['Row'];

async function getDailyOverviewData() {
    const supabase = await createClient();

    // Get current authenticated user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !authUser) {
        throw new Error('Not authenticated. Please log in.');
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

    // Extract PA IDs to filter shifts by production
    const paIds = (pas || []).map(pa => pa.id);

    // Fetch shifts for PAs in this production (we'll filter by date on the client side)
    let shifts;
    
    // When there are no PAs
    if (paIds.length === 0) {
        shifts = [];
    } else {
        const { data, error: shiftsError } = await supabase
            .from('shifts')
            .select('*')
            .in('assigned_pa_id', paIds)
            .order('date');

        if (shiftsError) {
            throw new Error(`Failed to fetch shifts: ${shiftsError.message}`);
        }
        
        shifts = data || [];
    }

    return {
        pas: pas || [],
        shifts: shifts || [],
    };
}

function LoadingState() {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading daily overview...</p>
            </div>
        </div>
    );
}

function ErrorDisplay({ error }: { error: Error }) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center p-8 bg-destructive/10 border border-destructive rounded-lg max-w-md">
                <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Daily Overview</h2>
                <p className="text-muted-foreground">{error.message}</p>
            </div>
        </div>
    );
}

export default async function DailyOverviewPage() {
    let data;
    let error: Error | null = null;

    try {
        data = await getDailyOverviewData();
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Daily Overview</h1>
                    <p className="text-muted-foreground mt-1">
                        View who's working on a specific day
                    </p>
                </div>
            </div>

            <Suspense fallback={<LoadingState />}>
                <DailyOverviewClient pas={data.pas} shifts={data.shifts} />
            </Suspense>
        </div>
    );
}

