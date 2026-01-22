'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

type PA = Database['public']['Tables']['users']['Row'];
type Shift = Database['public']['Tables']['shifts']['Row'];

interface DailyOverviewClientProps {
    pas: PA[];
    shifts: Shift[];
}

type FilterType = 'all' | 'confirmed' | 'pending';

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

function formatTime(timeStr: string | null): string {
    if (!timeStr) return 'Not set';
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        return `${parts[0]}:${parts[1]}`;
    }
    return timeStr;
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

export function DailyOverviewClient({ pas: initialPAs, shifts: initialShifts }: DailyOverviewClientProps) {
    // Initialize with today's date
    const today = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(today);
    const [filter, setFilter] = useState<FilterType>('all');
    const [selectedShift, setSelectedShift] = useState<{ shift: Shift; pa: PA } | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [callTime, setCallTime] = useState('');
    const [wrapTime, setWrapTime] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [shifts, setShifts] = useState<Shift[]>(initialShifts);
    const [pas, setPas] = useState<PA[]>(initialPAs);

    // Real-time subscription for shifts
    useEffect(() => {
        const supabase = createClient();
        const channel = supabase
            .channel('daily-overview-shifts-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'shifts',
                },
                (payload) => {
                    console.log('Daily Overview: Real-time shift update received:', payload);
                    try {
                        if (payload.eventType === 'INSERT') {
                            setShifts((prev) => {
                                const exists = prev.some(s => s.id === payload.new.id);
                                if (exists) {
                                    console.log('Daily Overview: Shift already exists, updating instead:', payload.new.id);
                                    return prev.map(shift => shift.id === payload.new.id ? (payload.new as Shift) : shift);
                                }
                                return [...prev, payload.new as Shift];
                            });
                        } else if (payload.eventType === 'UPDATE') {
                            setShifts((prev) =>
                                prev.map((shift) =>
                                    shift.id === payload.new.id ? (payload.new as Shift) : shift
                                )
                            );
                            console.log('Daily Overview: Shift updated via real-time:', payload.new);
                        } else if (payload.eventType === 'DELETE') {
                            setShifts((prev) => prev.filter((shift) => shift.id !== payload.old.id));
                            console.log('Daily Overview: Shift deleted via real-time:', payload.old.id);
                        }
                    } catch (error) {
                        console.error('Daily Overview: Error processing real-time shift update:', error);
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Daily Overview: Successfully subscribed to shifts changes');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('Daily Overview: Error subscribing to shifts changes');
                }
            });

        return () => {
            console.log('Daily Overview: Cleaning up shifts subscription');
            supabase.removeChannel(channel);
        };
    }, []);

    // Get shifts for selected date
    const shiftsForDate = useMemo(() => {
        return shifts.filter((shift) => shift.date === selectedDate);
    }, [shifts, selectedDate]);

    // Get PA info for each shift
    const shiftsWithPAs = useMemo(() => {
        return shiftsForDate
            .map((shift) => {
                const pa = pas.find((p) => p.id === shift.assigned_pa_id);
                return pa ? { shift, pa } : null;
            })
            .filter((item): item is { shift: Shift; pa: PA } => item !== null);
    }, [shiftsForDate, pas]);

    // Apply filter
    const filteredShifts = useMemo(() => {
        if (filter === 'all') return shiftsWithPAs;
        if (filter === 'confirmed') {
            return shiftsWithPAs.filter((item) => item.shift.confirmation_status === 'confirmed');
        }
        if (filter === 'pending') {
            return shiftsWithPAs.filter((item) => item.shift.confirmation_status === 'pending');
        }
        return shiftsWithPAs;
    }, [shiftsWithPAs, filter]);

    // Summary statistics
    const summary = useMemo(() => {
        const total = shiftsForDate.length;
        const confirmed = shiftsForDate.filter((s) => s.confirmation_status === 'confirmed').length;
        const pending = shiftsForDate.filter((s) => s.confirmation_status === 'pending').length;
        const declined = shiftsForDate.filter((s) => s.confirmation_status === 'declined').length;
        return { total, confirmed, pending, declined };
    }, [shiftsForDate]);

    const handleShiftClick = useCallback((shift: Shift, pa: PA) => {
        setSelectedShift({ shift, pa });
        // Convert "HH:MM:SS" to "HH:MM" for time input
        const callTimeValue = shift.call_time
            ? shift.call_time.split(':').slice(0, 2).join(':')
            : '';
        const wrapTimeValue = shift.wrap_time
            ? shift.wrap_time.split(':').slice(0, 2).join(':')
            : '';
        setCallTime(callTimeValue);
        setWrapTime(wrapTimeValue);
        setIsEditDialogOpen(true);
    }, []);

    const handleUpdateShift = useCallback(async () => {
        if (!selectedShift) return;

        setIsLoading(true);

        try {
            const supabase = createClient();
            // Ensure time is in "HH:MM:SS" format (add ":00" if only HH:MM is provided)
            const callTimeFormatted = callTime ? (callTime.includes(':') && callTime.split(':').length === 2 ? `${callTime}:00` : callTime) : null;
            const wrapTimeFormatted = wrapTime ? (wrapTime.includes(':') && wrapTime.split(':').length === 2 ? `${wrapTime}:00` : wrapTime) : null;

            console.log('Updating shift from daily overview:', {
                shiftId: selectedShift.shift.id,
                callTimeFormatted,
                wrapTimeFormatted,
            });

            const { data, error } = await supabase
                .from('shifts')
                .update({
                    call_time: callTimeFormatted,
                    wrap_time: wrapTimeFormatted,
                })
                .eq('id', selectedShift.shift.id)
                .select()
                .single();

            if (error) {
                console.error('Error updating shift from daily overview:', error);
                throw error;
            }

            console.log('Shift updated successfully from daily overview:', data);

            // Update local state with the returned data
            if (data) {
                setShifts((prev) =>
                    prev.map((shift) => (shift.id === selectedShift.shift.id ? data : shift))
                );
            }

            toast.success('Shift updated successfully!');
            setIsEditDialogOpen(false);
            setSelectedShift(null);
        } catch (error) {
            console.error('Failed to update shift from daily overview:', error);
            toast.error(
                `Failed to update shift: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            setIsLoading(false);
        }
    }, [selectedShift, callTime, wrapTime]);

    return (
        <div className="space-y-6">
            {/* Header with Back Button */}
            <div className="flex items-center gap-4">
                <Link href="/pc">
                    <Button variant="outline" size="sm">
                        <ChevronLeft className="h-4 w-4" />
                        Back to Dashboard
                    </Button>
                </Link>
            </div>

            {/* Date Picker */}
            <Card>
                <CardHeader>
                    <CardTitle>Select Date</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <Label htmlFor="date-picker">Date</Label>
                            <Input
                                id="date-picker"
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div className="flex items-end">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const today = new Date().toISOString().split('T')[0];
                                    setSelectedDate(today);
                                }}
                            >
                                Today
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary */}
            <Card>
                <CardHeader>
                    <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-lg">
                        <span className="font-semibold">{summary.total} PAs scheduled</span>,{' '}
                        <span className="text-green-600 font-medium">{summary.confirmed} confirmed</span>,{' '}
                        <span className="text-yellow-600 font-medium">{summary.pending} pending</span>
                        {summary.declined > 0 && (
                            <>
                                , <span className="text-red-600 font-medium">{summary.declined} declined</span>
                            </>
                        )}
                    </p>
                    <p className="text-muted-foreground mt-1">{formatDate(selectedDate)}</p>
                </CardContent>
            </Card>

            {/* Filters */}
            <div className="flex items-center gap-2">
                <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('all')}
                >
                    All
                </Button>
                <Button
                    variant={filter === 'confirmed' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('confirmed')}
                >
                    Show Confirmed
                </Button>
                <Button
                    variant={filter === 'pending' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('pending')}
                >
                    Show Pending
                </Button>
            </div>

            {/* PA List */}
            <div className="space-y-3">
                {filteredShifts.length === 0 ? (
                    <Card>
                        <CardContent className="p-6 text-center text-muted-foreground">
                            <p>
                                {shiftsForDate.length === 0
                                    ? 'No PAs scheduled for this date.'
                                    : `No ${filter === 'all' ? '' : filter} shifts found.`}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredShifts.map(({ shift, pa }) => {
                        const statusColor = getStatusColor(shift.confirmation_status);
                        const statusBadge = getStatusBadge(shift.confirmation_status);

                        return (
                            <Card
                                key={shift.id}
                                className={`cursor-pointer hover:shadow-md transition-shadow ${statusColor}`}
                                onClick={() => handleShiftClick(shift, pa)}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-lg font-semibold">{pa.name}</h3>
                                                <span
                                                    className={`text-xs px-2 py-0.5 rounded-full border ${statusColor}`}
                                                >
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
                                        <Button variant="ghost" size="sm">
                                            Edit
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Shift Details</DialogTitle>
                        <DialogDescription>
                            {selectedShift && `Update shift details for ${selectedShift.pa.name}`}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedShift && (
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="edit-call-time">Call Time</Label>
                                <Input
                                    id="edit-call-time"
                                    type="time"
                                    value={callTime}
                                    onChange={(e) => setCallTime(e.target.value)}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label htmlFor="edit-wrap-time">Wrap Time</Label>
                                <Input
                                    id="edit-wrap-time"
                                    type="time"
                                    value={wrapTime}
                                    onChange={(e) => setWrapTime(e.target.value)}
                                    className="mt-1"
                                />
                            </div>
                            <div className="text-sm text-muted-foreground">
                                <p>
                                    <span className="font-medium">Date:</span> {formatDate(selectedShift.shift.date)}
                                </p>
                                <p>
                                    <span className="font-medium">Status:</span>{' '}
                                    {getStatusBadge(selectedShift.shift.confirmation_status)}
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateShift} disabled={isLoading}>
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

