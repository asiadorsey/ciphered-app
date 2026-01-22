'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Availability = Database['public']['Tables']['availability']['Row'];

interface DateInfo {
    date: string;
    display: string;
    dayName: string;
    day: number;
    month: number;
}

interface PACalendarProps {
    userId: string;
    availability: Availability[];
    dates?: DateInfo[]; // Optional, will be generated internally
    startDate?: string; // Optional, will be calculated internally
    endDate?: string; // Optional, will be calculated internally
}

type AvailabilityStatus = 'unavailable' | 'available' | 'preferred' | null;

function getAvailabilityForDate(date: string, availability: Availability[]): Availability | null {
    return availability.find((a) => a.date === date) || null;
}

function getStatusColor(status: AvailabilityStatus): string {
    switch (status) {
        case 'preferred':
            return 'bg-green-600 text-white hover:bg-green-700';
        case 'available':
            return 'bg-green-300 text-green-900 hover:bg-green-400';
        case 'unavailable':
            return 'bg-red-300 text-red-900 hover:bg-red-400';
        default:
            return 'bg-gray-100 text-gray-500 hover:bg-gray-200';
    }
}

function getStatusLabel(status: AvailabilityStatus): string {
    switch (status) {
        case 'preferred':
            return 'Preferred';
        case 'available':
            return 'Available';
        case 'unavailable':
            return 'Unavailable';
        default:
            return 'Not Set';
    }
}

function cycleStatus(current: AvailabilityStatus): AvailabilityStatus {
    if (current === null) return 'unavailable';
    if (current === 'unavailable') return 'available';
    if (current === 'available') return 'preferred';
    return null; // preferred -> null (not set)
}

// Generate dates for a full calendar month view
function generateMonthDates(year: number, month: number): DateInfo[] {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Start from the first day of the week that contains the first day of the month
    const startDate = new Date(firstDay);
    const dayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
    startDate.setDate(startDate.getDate() - dayOfWeek);
    
    // Generate 42 dates (6 weeks * 7 days) to fill the grid
    const dates: DateInfo[] = [];
    const currentDate = new Date(startDate);
    
    for (let i = 0; i < 42; i++) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
        const day = currentDate.getDate();
        const dateMonth = currentDate.getMonth() + 1;
        
        dates.push({
            date: dateStr,
            display: `${dayName} ${dateMonth}/${day}`,
            dayName,
            day,
            month: dateMonth,
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
}

// Get month options (current month + up to 3 months ahead)
function getAvailableMonths(): Array<{ value: string; label: string; year: number; month: number }> {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    const months: Array<{ value: string; label: string; year: number; month: number }> = [];
    
    for (let i = 0; i <= 3; i++) {
        const monthDate = new Date(currentYear, currentMonth + i, 1);
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        months.push({
            value: `${year}-${month}`,
            label: monthName,
            year,
            month,
        });
    }
    
    return months;
}

// Format month value for state
function formatMonthKey(year: number, month: number): string {
    return `${year}-${month}`;
}

export function PACalendar({
    userId,
    availability: initialAvailability,
}: PACalendarProps) {
    // Month state - initialize to current month
    const today = new Date();
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
    
    // Generate dates for the selected month
    const dates = useMemo(() => {
        return generateMonthDates(selectedYear, selectedMonth);
    }, [selectedYear, selectedMonth]);
    
    // Get start and end dates for the selected month
    const monthStartDate = useMemo(() => {
        return new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0];
    }, [selectedYear, selectedMonth]);
    
    const monthEndDate = useMemo(() => {
        return new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0];
    }, [selectedYear, selectedMonth]);
    
    // Initialize availability state - will be populated by useEffect
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [noteDialogOpen, setNoteDialogOpen] = useState(false);
    const [currentNote, setCurrentNote] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
    
    // Get available months for dropdown
    const availableMonths = useMemo(() => getAvailableMonths(), []);
    
    // Fetch availability when month changes
    useEffect(() => {
        const fetchAvailability = async () => {
            setIsLoadingAvailability(true);
            try {
                const supabase = createClient();
                const { data, error } = await supabase
                    .from('availability')
                    .select('*')
                    .eq('user_id', userId)
                    .gte('date', monthStartDate)
                    .lte('date', monthEndDate)
                    .order('date');
                
                if (error) throw error;
                
                setAvailability(data || []);
            } catch (error) {
                console.error('Failed to fetch availability:', error);
                toast.error('Failed to load availability for selected month');
            } finally {
                setIsLoadingAvailability(false);
            }
        };
        
        fetchAvailability();
    }, [userId, monthStartDate, monthEndDate]);

    // Navigation functions
    const goToPreviousMonth = useCallback(() => {
        setSelectedMonth((prev) => {
            if (prev === 0) {
                setSelectedYear((prevYear) => prevYear - 1);
                return 11;
            }
            return prev - 1;
        });
    }, []);
    
    const goToNextMonth = useCallback(() => {
        const today = new Date();
        const maxMonth = today.getMonth() + 3; // 3 months ahead
        const maxYear = today.getFullYear() + Math.floor(maxMonth / 12);
        const maxMonthIndex = maxMonth % 12;
        
        const currentMonthIndex = selectedMonth;
        const currentYearIndex = selectedYear;
        
        // Check if we can go to next month
        if (
            currentYearIndex < maxYear ||
            (currentYearIndex === maxYear && currentMonthIndex < maxMonthIndex)
        ) {
            setSelectedMonth((prev) => {
                if (prev === 11) {
                    setSelectedYear((prevYear) => prevYear + 1);
                    return 0;
                }
                return prev + 1;
            });
        }
    }, [selectedYear, selectedMonth]);
    
    const goToCurrentMonth = useCallback(() => {
        const today = new Date();
        setSelectedYear(today.getFullYear());
        setSelectedMonth(today.getMonth());
    }, []);
    
    const handleMonthSelect = useCallback((value: string) => {
        const [year, month] = value.split('-').map(Number);
        setSelectedYear(year);
        setSelectedMonth(month);
    }, []);
    
    // Check if we can navigate to previous/next month
    const canGoPrevious = useMemo(() => {
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        
        return selectedYear > todayYear || 
               (selectedYear === todayYear && selectedMonth > todayMonth);
    }, [selectedYear, selectedMonth]);
    
    const canGoNext = useMemo(() => {
        const today = new Date();
        const maxMonth = today.getMonth() + 3; // 3 months ahead
        const maxYear = today.getFullYear() + Math.floor(maxMonth / 12);
        const maxMonthIndex = maxMonth % 12;
        
        return selectedYear < maxYear ||
               (selectedYear === maxYear && selectedMonth < maxMonthIndex);
    }, [selectedYear, selectedMonth]);
    
    const isCurrentMonth = useMemo(() => {
        const today = new Date();
        return selectedYear === today.getFullYear() && selectedMonth === today.getMonth();
    }, [selectedYear, selectedMonth]);
    
    // Real-time subscription for availability changes
    useEffect(() => {
        const supabase = createClient();
        const channel = supabase
            .channel('pa-availability-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'availability',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const changedDate = (payload.new as Availability)?.date || (payload.old as Availability)?.date;
                    // Only update if the changed date is in the current month view
                    if (changedDate && changedDate >= monthStartDate && changedDate <= monthEndDate) {
                        if (payload.eventType === 'INSERT') {
                            setAvailability((prev) => [...prev, payload.new as Availability]);
                        } else if (payload.eventType === 'UPDATE') {
                            setAvailability((prev) =>
                                prev.map((avail) =>
                                    avail.id === payload.new.id ? (payload.new as Availability) : avail
                                )
                            );
                        } else if (payload.eventType === 'DELETE') {
                            setAvailability((prev) => prev.filter((avail) => avail.id !== payload.old.id));
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, monthStartDate, monthEndDate]);

    const handleDateClick = useCallback(
        async (date: string) => {
            const currentAvail = getAvailabilityForDate(date, availability);
            const currentStatus = currentAvail?.status || null;
            const newStatus = cycleStatus(currentStatus);

            setIsLoading(true);
            const tempId = `temp-${Date.now()}-${Math.random()}`;

            // Optimistic update
            if (newStatus === null) {
                // Remove availability
                if (currentAvail) {
                    setAvailability((prev) => prev.filter((a) => a.id !== currentAvail.id));
                }
            } else if (currentAvail) {
                // Update existing
                setAvailability((prev) =>
                    prev.map((a) =>
                        a.id === currentAvail.id
                            ? { ...a, status: newStatus, updated_at: new Date().toISOString() }
                            : a
                    )
                );
            } else {
                // Create new
                const optimistic: Availability = {
                    id: tempId,
                    user_id: userId,
                    date,
                    status: newStatus,
                    pa_note: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                setAvailability((prev) => [...prev, optimistic]);
            }

            try {
                const supabase = createClient();

                if (newStatus === null) {
                    // Delete
                    if (currentAvail) {
                        console.log('[PA Calendar] Deleting availability:', {
                            id: currentAvail.id,
                            user_id: currentAvail.user_id,
                            date: currentAvail.date,
                            status: currentAvail.status,
                        });
                        const { error } = await supabase
                            .from('availability')
                            .delete()
                            .eq('id', currentAvail.id);

                        if (error) throw error;
                    }
                } else if (currentAvail) {
                    // Update
                    console.log('[PA Calendar] Updating availability:', {
                        id: currentAvail.id,
                        user_id: currentAvail.user_id,
                        date: currentAvail.date,
                        oldStatus: currentAvail.status,
                        newStatus: newStatus,
                    });
                    const { error } = await supabase
                        .from('availability')
                        .update({ status: newStatus })
                        .eq('id', currentAvail.id);

                    if (error) throw error;
                } else {
                    // Insert
                    console.log('[PA Calendar] Inserting availability:', {
                        user_id: userId,
                        date: date,
                        status: newStatus,
                        dateFormat: 'ISO string format (YYYY-MM-DD)',
                        rawQuery: `INSERT INTO availability (user_id, date, status) VALUES ('${userId}', '${date}', '${newStatus}')`,
                    });
                    const { data, error } = await supabase
                        .from('availability')
                        .insert({
                            user_id: userId,
                            date,
                            status: newStatus,
                        })
                        .select()
                        .single();

                    if (error) throw error;

                    console.log('[PA Calendar] Availability inserted successfully:', {
                        id: data.id,
                        user_id: data.user_id,
                        date: data.date,
                        status: data.status,
                    });

                    // Replace optimistic update
                    setAvailability((prev) =>
                        prev.filter((a) => a.id !== tempId).concat(data)
                    );
                }

                toast.success(`Availability set to ${getStatusLabel(newStatus)}`);
            } catch (error) {
                // Re-fetch availability to sync state on error
                const supabase = createClient();
                const { data } = await supabase
                    .from('availability')
                    .select('*')
                    .eq('user_id', userId)
                    .gte('date', monthStartDate)
                    .lte('date', monthEndDate)
                    .order('date');
                
                if (data) {
                    setAvailability(data);
                }
                
                toast.error(
                    `Failed to update availability: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            } finally {
                setIsLoading(false);
            }
        },
        [availability, userId, monthStartDate, monthEndDate]
    );

    const handleNoteClick = useCallback((date: string) => {
        const currentAvail = getAvailabilityForDate(date, availability);
        setSelectedDate(date);
        setCurrentNote(currentAvail?.pa_note || '');
        setNoteDialogOpen(true);
    }, [availability]);

    const saveNote = useCallback(async () => {
        if (!selectedDate) return;

        setIsLoading(true);
        const currentAvail = getAvailabilityForDate(selectedDate, availability);
        const tempId = `temp-${Date.now()}-${Math.random()}`;

        // Optimistic update
        if (currentAvail) {
            setAvailability((prev) =>
                prev.map((a) =>
                    a.id === currentAvail.id
                        ? { ...a, pa_note: currentNote || null, updated_at: new Date().toISOString() }
                        : a
                )
            );
        } else {
            // Need to create availability first
            const optimistic: Availability = {
                id: tempId,
                user_id: userId,
                date: selectedDate,
                status: 'available', // Default status when adding note
                pa_note: currentNote || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            setAvailability((prev) => [...prev, optimistic]);
        }

        try {
            const supabase = createClient();

            if (currentAvail) {
                // Update note
                console.log('[PA Calendar] Updating availability note:', {
                    id: currentAvail.id,
                    user_id: currentAvail.user_id,
                    date: currentAvail.date,
                    note: currentNote || null,
                });
                const { error } = await supabase
                    .from('availability')
                    .update({ pa_note: currentNote || null })
                    .eq('id', currentAvail.id);

                if (error) throw error;
            } else {
                // Create with note
                console.log('[PA Calendar] Inserting availability with note:', {
                    user_id: userId,
                    date: selectedDate,
                    status: 'available',
                    note: currentNote || null,
                    dateFormat: 'ISO string format (YYYY-MM-DD)',
                    rawQuery: `INSERT INTO availability (user_id, date, status, pa_note) VALUES ('${userId}', '${selectedDate}', 'available', ${currentNote ? `'${currentNote}'` : 'NULL'})`,
                });
                const { data, error } = await supabase
                    .from('availability')
                    .insert({
                        user_id: userId,
                        date: selectedDate,
                        status: 'available',
                        pa_note: currentNote || null,
                    })
                    .select()
                    .single();

                if (error) throw error;

                console.log('[PA Calendar] Availability with note inserted successfully:', {
                    id: data.id,
                    user_id: data.user_id,
                    date: data.date,
                    status: data.status,
                    note: data.pa_note,
                });

                // Replace optimistic update
                setAvailability((prev) =>
                    prev.filter((a) => a.id !== tempId).concat(data)
                );
            }

            toast.success('Note saved successfully!');
            setNoteDialogOpen(false);
            setSelectedDate(null);
            setCurrentNote('');
        } catch (error) {
            // Re-fetch availability to sync state on error
            const supabase = createClient();
            const { data } = await supabase
                .from('availability')
                .select('*')
                .eq('user_id', userId)
                .gte('date', monthStartDate)
                .lte('date', monthEndDate)
                .order('date');
            
            if (data) {
                setAvailability(data);
            }
            
            toast.error(`Failed to save note: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate, currentNote, availability, userId, monthStartDate, monthEndDate]);

    const currentMonthLabel = useMemo(() => {
        const monthDate = new Date(selectedYear, selectedMonth, 1);
        return monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }, [selectedYear, selectedMonth]);
    
    const currentMonthValue = formatMonthKey(selectedYear, selectedMonth);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">My Availability</h2>
                <p className="text-sm text-muted-foreground">Click dates to cycle availability • Click note icon to add notes</p>
            </div>

            {/* Month Navigation Controls */}
            <div className="flex items-center justify-between gap-4 p-4 bg-card border rounded-lg">
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={goToPreviousMonth}
                        disabled={!canGoPrevious || isLoadingAvailability}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <Select value={currentMonthValue} onValueChange={handleMonthSelect} disabled={isLoadingAvailability}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select month" />
                        </SelectTrigger>
                        <SelectContent>
                            {availableMonths.map((month) => (
                                <SelectItem key={month.value} value={month.value}>
                                    {month.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={goToNextMonth}
                        disabled={!canGoNext || isLoadingAvailability}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                
                <Button
                    variant="outline"
                    size="sm"
                    onClick={goToCurrentMonth}
                    disabled={isCurrentMonth || isLoadingAvailability}
                >
                    Current Month
                </Button>
            </div>

            <div className="border rounded-lg p-6 bg-card">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                        <div key={day} className="text-center text-sm font-semibold text-muted-foreground py-2">
                            {day}
                        </div>
                    ))}
                </div>
                
                {isLoadingAvailability ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                            <p className="text-sm text-muted-foreground">Loading calendar...</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-7 gap-2">
                        {dates.map((dateInfo) => {
                        const date = new Date(dateInfo.date);
                        const isCurrentMonth = date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
                        const isToday = date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                        
                        const avail = getAvailabilityForDate(dateInfo.date, availability);
                        const status = avail?.status || null;
                        const colorClass = getStatusColor(status);
                        const hasNote = !!avail?.pa_note;

                        return (
                            <div
                                key={dateInfo.date}
                                className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                                    isCurrentMonth 
                                        ? 'hover:border-primary' 
                                        : 'opacity-40 hover:opacity-60'
                                } ${isToday && isCurrentMonth ? 'ring-2 ring-primary' : ''}`}
                            >
                                <button
                                    onClick={() => handleDateClick(dateInfo.date)}
                                    disabled={isLoading || !isCurrentMonth}
                                    className={`w-full py-2 px-3 rounded-md text-xs font-medium transition-colors ${colorClass} ${
                                        !isCurrentMonth ? 'opacity-50' : ''
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    title={`${dateInfo.display}: ${getStatusLabel(status)}`}
                                >
                                    <div className="text-center">
                                        <div className={`font-semibold ${isToday && isCurrentMonth ? 'underline' : ''}`}>
                                            {dateInfo.day}
                                        </div>
                                        <div className="text-[10px] opacity-80">{dateInfo.dayName}</div>
                                    </div>
                                </button>
                                {isCurrentMonth && (
                                    <button
                                        onClick={() => handleNoteClick(dateInfo.date)}
                                        disabled={isLoading}
                                        className={`text-xs p-1 rounded hover:bg-muted transition-colors ${
                                            hasNote ? 'text-primary' : 'text-muted-foreground'
                                        }`}
                                        title={hasNote ? avail?.pa_note || 'Edit note' : 'Add note'}
                                    >
                                        {hasNote ? '📝' : '✏️'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 p-4 bg-card border rounded-lg">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-green-600"></div>
                    <span className="text-sm">Preferred</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-green-300"></div>
                    <span className="text-sm">Available</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-red-300"></div>
                    <span className="text-sm">Unavailable</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-gray-100"></div>
                    <span className="text-sm">Not Set</span>
                </div>
            </div>

            {/* Note Dialog */}
            <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Note</DialogTitle>
                        <DialogDescription>
                            Add a note for{' '}
                            {selectedDate
                                ? new Date(selectedDate).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                })
                                : 'this date'}
                            . For example: "Can work late" or "Prefer morning"
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="note">Note</Label>
                            <textarea
                                id="note"
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                                value={currentNote}
                                onChange={(e) => setCurrentNote(e.target.value)}
                                placeholder="e.g., Can work late, Prefer morning shifts"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setNoteDialogOpen(false);
                                setSelectedDate(null);
                                setCurrentNote('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button onClick={saveNote} disabled={isLoading}>
                            {isLoading ? 'Saving...' : 'Save Note'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

