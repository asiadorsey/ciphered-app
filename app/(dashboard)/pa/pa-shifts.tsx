'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  sendShiftConfirmationEmail,
  getUserDetails,
} from '@/lib/email/notifications';

type Shift = Database['public']['Tables']['shifts']['Row'];

interface PAShiftsProps {
    userId: string;
    shifts: Shift[];
    pendingCount: number;
}

function getStatusColor(status: 'pending' | 'confirmed' | 'declined'): string {
    switch (status) {
        case 'confirmed':
            return 'text-green-600 bg-green-50 border-green-200';
        case 'declined':
            return 'text-red-600 bg-red-50 border-red-200';
        default:
            return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
}

function getStatusBadge(status: 'pending' | 'confirmed' | 'declined'): string {
    switch (status) {
        case 'confirmed':
            return '✓ Confirmed';
        case 'declined':
            return '✗ Declined';
        default:
            return '⏳ Pending';
    }
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatTime(timeStr: string | null): string {
    if (!timeStr) return 'Not set';
    // Time is stored as HH:MM:SS, we want HH:MM
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        return `${parts[0]}:${parts[1]}`;
    }
    return timeStr;
}

export function PAShifts({ userId, shifts: initialShifts, pendingCount: initialPendingCount }: PAShiftsProps) {
    const [shifts, setShifts] = useState<Shift[]>(initialShifts);
    const [isLoading, setIsLoading] = useState<string | null>(null);

    // Real-time subscription for shifts
    useEffect(() => {
        const supabase = createClient();
        const supabaseAny = supabase as any;
        const channel = supabaseAny
            .channel('pa-shifts-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'shifts',
                    filter: `assigned_pa_id=eq.${userId}`,
                },
                (payload) => {
                    try {
                        if (payload.eventType === 'INSERT') {
                            if (!payload.new || !payload.new.id) {
                                console.error('PA: INSERT payload missing new data or id:', payload);
                                return;
                            }
                            setShifts((prev) => {
                                // Check if shift already exists (avoid duplicates)
                                const exists = prev.some(s => s.id === payload.new.id);
                                if (exists) {
                                    return prev.map(shift => shift.id === payload.new.id ? (payload.new as Shift) : shift);
                                }
                                return [...prev, payload.new as Shift];
                            });
                        } else if (payload.eventType === 'UPDATE') {
                            if (!payload.new || !payload.new.id) {
                                console.error('PA: UPDATE payload missing new data or id:', payload);
                                return;
                            }
                            setShifts((prev) => {
                                const shiftExists = prev.some(shift => shift.id === payload.new.id);
                                if (!shiftExists) {
                                    // If shift doesn't exist in local state, add it
                                    return [...prev, payload.new as Shift];
                                }
                                return prev.map((shift) =>
                                    shift.id === payload.new.id ? (payload.new as Shift) : shift
                                );
                            });
                        } else if (payload.eventType === 'DELETE') {
                            if (!payload.old || !payload.old.id) {
                                console.error('PA: DELETE payload missing old data or id:', payload);
                                return;
                            }
                            setShifts((prev) => prev.filter((shift) => shift.id !== payload.old.id));
                        }
                    } catch (error) {
                        console.error('PA: Error processing real-time shift update:', error, payload);
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR') {
                    console.error('PA: Error subscribing to shifts changes');
                }
            });

        return () => {
            supabaseAny.removeChannel(channel);
        };
    }, [userId]);

    const pendingCount = useMemo(() => {
        return shifts.filter((shift) => shift.confirmation_status === 'pending').length;
    }, [shifts]);

    const confirmShift = useCallback(
        async (shiftId: string) => {
            setIsLoading(shiftId);

            // Capture previous state for rollback before optimistic update
            let previousShift: Shift | undefined;
            setShifts((prev) => {
                previousShift = prev.find((s) => s.id === shiftId);
                // Optimistic update
                return prev.map((shift) =>
                    shift.id === shiftId
                        ? { ...shift, confirmation_status: 'confirmed' as const }
                        : shift
                );
            });

            try {
                const supabase = createClient();
                const supabaseAny = supabase as any;
                const { data, error } = await supabaseAny
                    .from('shifts')
                    .update({ confirmation_status: 'confirmed' })
                    .eq('id', shiftId)
                    .select()
                    .single();

                if (error) {
                    console.error('PA: Error confirming shift:', error);
                    throw error;
                }

                // Send email notification to PC
                try {
                    if (data && data.assigned_by_id) {
                        // Fetch PA details (name)
                        const paDetails = await getUserDetails(userId, supabaseAny);
                        
                        // Fetch PC details (email) from assigned_by_id
                        const pcDetails = await getUserDetails(data.assigned_by_id, supabaseAny);

                        if (pcDetails?.email && paDetails?.name) {
                            await sendShiftConfirmationEmail({
                                pcEmail: pcDetails.email,
                                paName: paDetails.name,
                                date: data.date,
                                confirmationStatus: 'confirmed',
                                callTime: data.call_time,
                                wrapTime: data.wrap_time,
                            });
                        } else {
                            console.warn('Could not fetch required details for email notification');
                        }
                    }
                } catch (emailError) {
                    // Log error but don't fail the shift confirmation
                    console.error('Failed to send shift confirmation email:', emailError);
                }

                toast.success('Shift confirmed!');
            } catch (error) {
                console.error('PA: Failed to confirm shift:', error);
                // Rollback to previous state if we have it
                if (previousShift) {
                    setShifts((prev) =>
                        prev.map((shift) =>
                            shift.id === shiftId ? previousShift! : shift
                        )
                    );
                }
                toast.error(
                    `Failed to confirm shift: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            } finally {
                setIsLoading(null);
            }
        },
        [userId]
    );

    const declineShift = useCallback(
        async (shiftId: string) => {
            if (!confirm('Are you sure you want to decline this shift?')) {
                return;
            }

            setIsLoading(shiftId);

            // Capture previous state for rollback before optimistic update
            let previousShift: Shift | undefined;
            setShifts((prev) => {
                previousShift = prev.find((s) => s.id === shiftId);
                // Optimistic update
                return prev.map((shift) =>
                    shift.id === shiftId
                        ? { ...shift, confirmation_status: 'declined' as const }
                        : shift
                );
            });

            try {
                const supabase = createClient();
                const supabaseAny = supabase as any;
                const { data, error } = await supabaseAny
                    .from('shifts')
                    .update({ confirmation_status: 'declined' })
                    .eq('id', shiftId)
                    .select()
                    .single();

                if (error) {
                    console.error('PA: Error declining shift:', error);
                    throw error;
                }

                // Send email notification to PC
                try {
                    if (data && data.assigned_by_id) {
                        // Fetch PA details (name)
                        const paDetails = await getUserDetails(userId, supabaseAny);
                        
                        // Fetch PC details (email) from assigned_by_id
                        const pcDetails = await getUserDetails(data.assigned_by_id, supabaseAny);

                        if (pcDetails?.email && paDetails?.name) {
                            await sendShiftConfirmationEmail({
                                pcEmail: pcDetails.email,
                                paName: paDetails.name,
                                date: data.date,
                                confirmationStatus: 'declined',
                                callTime: data.call_time,
                                wrapTime: data.wrap_time,
                            });
                        } else {
                            console.warn('Could not fetch required details for email notification');
                        }
                    }
                } catch (emailError) {
                    // Log error but don't fail the shift decline
                    console.error('Failed to send shift decline email:', emailError);
                }

                toast.success('Shift declined.');
            } catch (error) {
                console.error('PA: Failed to decline shift:', error);
                // Rollback to previous state if we have it
                if (previousShift) {
                    setShifts((prev) =>
                        prev.map((shift) =>
                            shift.id === shiftId ? previousShift! : shift
                        )
                    );
                }
                toast.error(
                    `Failed to decline shift: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            } finally {
                setIsLoading(null);
            }
        },
        [userId]
    );

    // Sort shifts: pending first, then by date
    const sortedShifts = useMemo(() => {
        return [...shifts].sort((a, b) => {
            // Pending shifts first
            if (a.confirmation_status === 'pending' && b.confirmation_status !== 'pending') return -1;
            if (a.confirmation_status !== 'pending' && b.confirmation_status === 'pending') return 1;
            // Then by date
            return a.date.localeCompare(b.date);
        });
    }, [shifts]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">My Shifts</h2>
                {pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center rounded-full bg-yellow-500 text-white text-xs font-semibold px-2.5 py-0.5 min-w-[1.5rem]">
                        {pendingCount}
                    </span>
                )}
            </div>

            <div className="space-y-3">
                {sortedShifts.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground border rounded-lg bg-card">
                        <p>No shifts assigned yet.</p>
                    </div>
                ) : (
                    sortedShifts.map((shift) => {
                        const statusColor = getStatusColor(shift.confirmation_status);
                        const statusBadge = getStatusBadge(shift.confirmation_status);

                        return (
                            <div
                                key={shift.id}
                                className={`p-4 border rounded-lg bg-card ${statusColor} transition-colors`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{formatDate(shift.date)}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor}`}>
                                                {statusBadge}
                                            </span>
                                        </div>
                                        <div className="space-y-1 text-sm">
                                            <div>
                                                <span className="font-medium">Call Time:</span>{' '}
                                                <span className="text-muted-foreground">
                                                    {formatTime(shift.call_time)}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="font-medium">Wrap Time:</span>{' '}
                                                <span className="text-muted-foreground">
                                                    {formatTime(shift.wrap_time)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {shift.confirmation_status === 'pending' && (
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => declineShift(shift.id)}
                                                disabled={isLoading === shift.id}
                                            >
                                                {isLoading === shift.id ? '...' : 'Decline'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => confirmShift(shift.id)}
                                                disabled={isLoading === shift.id}
                                            >
                                                {isLoading === shift.id ? '...' : 'Confirm'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

