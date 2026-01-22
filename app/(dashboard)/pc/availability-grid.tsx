'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
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
import {
  getUserDetails,
} from '@/lib/email/notifications';

type PA = Database['public']['Tables']['users']['Row'];
type Availability = Database['public']['Tables']['availability']['Row'];
type Shift = Database['public']['Tables']['shifts']['Row'];

interface DateInfo {
  date: string;
  display: string;
}

interface AvailabilityGridProps {
  pas: PA[];
  availability: Availability[];
  shifts: Shift[];
  initialWeekMonday: string; // ISO date string for Monday of the initial week
}

type AvailabilityStatus = 'unavailable' | 'available' | 'preferred' | null;

interface SelectedCell {
  paId: string;
  paName: string;
  date: string;
  dateDisplay: string;
  status: AvailabilityStatus;
  shift: Shift | null;
  paNote: string | null;
}

function getAvailabilityStatus(
  paId: string,
  date: string,
  availability: Availability[]
): AvailabilityStatus {
  const avail = availability.find(
    (a) => a.user_id === paId && a.date === date
  );
  return avail?.status || null;
}

function getShiftForCell(paId: string, date: string, shifts: Shift[]): Shift | null {
  return shifts.find((shift) => shift.assigned_pa_id === paId && shift.date === date) || null;
}

function getStatusColor(status: AvailabilityStatus, hasShift: boolean): string {
  if (hasShift) {
    return 'bg-primary text-primary-foreground';
  }
  switch (status) {
    case 'preferred':
      return 'bg-green-500 text-white';
    case 'available':
      return 'bg-green-200 text-green-900';
    case 'unavailable':
      return 'bg-red-200 text-red-900';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

function getStatusLabel(status: AvailabilityStatus, hasShift: boolean): string {
  if (hasShift) {
    return 'Assigned';
  }
  switch (status) {
    case 'preferred':
      return 'Preferred';
    case 'available':
      return 'Available';
    case 'unavailable':
      return 'Unavailable';
    default:
      return 'No data';
  }
}

function getConfirmationStatusColor(status: 'pending' | 'confirmed' | 'declined'): string {
  switch (status) {
    case 'confirmed':
      return 'text-green-600';
    case 'declined':
      return 'text-red-600';
    default:
      return 'text-yellow-600';
  }
}

// Helper function to get Monday of a given week from an ISO date string
function getMondayOfWeekISO(isoDateStr: string): string {
  const [year, month, day] = isoDateStr.split('-').map(Number);
  // Create a UTC date at midnight
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
  // Calculate days to subtract to get to Monday
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return addDaysToISO(isoDateStr, -daysToMonday);
}

// Helper function to add days to an ISO date string (YYYY-MM-DD) without timezone conversion
function addDaysToISO(isoDateStr: string, days: number): string {
  const [year, month, day] = isoDateStr.split('-').map(Number);
  // Create a UTC date at midnight to avoid timezone conversion
  const date = new Date(Date.UTC(year, month - 1, day + days));
  // Format back to ISO string (YYYY-MM-DD)
  const resultYear = date.getUTCFullYear();
  const resultMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const resultDay = String(date.getUTCDate()).padStart(2, '0');
  return `${resultYear}-${resultMonth}-${resultDay}`;
}

// Helper function to format an ISO date string for display
function formatISODateForDisplay(isoDateStr: string): { month: number; day: number; year: number } {
  const [year, month, day] = isoDateStr.split('-').map(Number);
  return { month, day, year };
}

// Helper function to format month name and day from ISO date string
function formatISODateShort(isoDateStr: string): string {
  const { month, day } = formatISODateForDisplay(isoDateStr);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[month - 1]} ${day}`;
}

// Helper function to generate dates for a week (Mon-Sun)
// Uses ISO format directly to match database format (no timezone conversion)
function generateWeekDates(mondayISO: string): DateInfo[] {
  const dates: DateInfo[] = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < 7; i++) {
    // Add days directly to ISO string without timezone conversion
    const dateStr = addDaysToISO(mondayISO, i);
    const { month, day } = formatISODateForDisplay(dateStr);

    dates.push({
      date: dateStr,
      display: `${dayNames[i]} ${month}/${day}`,
    });
  }

  return dates;
}

// Helper function to format week display using ISO date strings
function formatWeekDisplay(mondayISO: string): string {
  const sundayISO = addDaysToISO(mondayISO, 6);
  const mondayDate = formatISODateForDisplay(mondayISO);
  const mondayFormatted = formatISODateShort(mondayISO);
  const sundayFormatted = formatISODateShort(sundayISO);

  return `Week of ${mondayFormatted} - ${sundayFormatted}, ${mondayDate.year}`;
}

export function AvailabilityGrid({
  pas,
  availability: initialAvailability,
  shifts: initialShifts,
  initialWeekMonday,
}: AvailabilityGridProps) {
  // Week state management - store ISO date string directly
  const [selectedWeekMonday, setSelectedWeekMonday] = useState<string>(initialWeekMonday);

  // Calculate dates for the selected week
  const dates = useMemo(() => {
    return generateWeekDates(selectedWeekMonday);
  }, [selectedWeekMonday]);

  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [showOnlyPreferred, setShowOnlyPreferred] = useState(false);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [availability, setAvailability] = useState<Availability[]>(initialAvailability);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form state for assign/edit
  const [callTime, setCallTime] = useState('');
  const [wrapTime, setWrapTime] = useState('');
  const [location, setLocation] = useState('');

  // Get current user ID
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
      }
    });
  }, []);

  // Real-time subscription for shifts
  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createClient();
    const channel = supabase
      .channel('shifts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
        },
        (payload) => {
          try {
            if (payload.eventType === 'INSERT') {
              setShifts((prev) => {
                // Check if shift already exists (avoid duplicates from optimistic updates)
                const exists = prev.some(s => s.id === payload.new.id);
                if (exists) {
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
            } else if (payload.eventType === 'DELETE') {
              setShifts((prev) => prev.filter((shift) => shift.id !== payload.old.id));
            }
          } catch (error) {
            console.error('Error processing real-time shift update:', error);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Error subscribing to shifts changes');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Real-time subscription for availability
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('availability-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'availability',
        },
        (payload) => {
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
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCellClick = useCallback(
    (pa: PA, dateInfo: DateInfo) => {
      const status = getAvailabilityStatus(pa.id, dateInfo.date, availability);
      const shift = getShiftForCell(pa.id, dateInfo.date, shifts);
      const availRecord = availability.find(
        (a) => a.user_id === pa.id && a.date === dateInfo.date
      );

      const cellData: SelectedCell = {
        paId: pa.id,
        paName: pa.name,
        date: dateInfo.date,
        dateDisplay: dateInfo.display,
        status,
        shift,
        paNote: availRecord?.pa_note || null,
      };

      setSelectedCell(cellData);

      if (shift) {
        // Show view/edit dialog for assigned cells
        // Convert HH:MM:SS to HH:MM for time input
        const callTimeValue = shift.call_time
          ? shift.call_time.split(':').slice(0, 2).join(':')
          : '';
        const wrapTimeValue = shift.wrap_time
          ? shift.wrap_time.split(':').slice(0, 2).join(':')
          : '';
        setCallTime(callTimeValue);
        setWrapTime(wrapTimeValue);
        setLocation(''); // Note: location field may need to be added to DB schema
        setIsEditMode(false);
        setIsViewDialogOpen(true);
      } else if (status === 'available' || status === 'preferred') {
        // Show assign dialog for available/preferred cells
        setCallTime('');
        setWrapTime('');
        setLocation('');
        setIsAssignDialogOpen(true);
      }
    },
    [availability, shifts]
  );

  // Helper function to format time from HH:MM to HH:MM:SS
  const formatTimeForDB = useCallback((timeStr: string | null): string | null => {
    if (!timeStr) return null;
    // If time is already in HH:MM:SS format, return as-is
    if (timeStr.includes(':') && timeStr.split(':').length === 3) {
      return timeStr;
    }
    // If time is in HH:MM format, add :00 seconds
    if (timeStr.includes(':') && timeStr.split(':').length === 2) {
      return `${timeStr}:00`;
    }
    // If invalid format, log and return null
    console.warn('Invalid time format:', timeStr);
    return null;
  }, []);

  const createShift = useCallback(async () => {
    if (!currentUserId || !selectedCell) {
      toast.error('Unable to assign shift. Please try again.');
      return;
    }

    setIsLoading(true);

    // Format times for database (HH:MM:SS)
    const formattedCallTime = formatTimeForDB(callTime);
    const formattedWrapTime = formatTimeForDB(wrapTime);

    // Optimistic update
    const optimisticShift: Shift = {
      id: `temp-${Date.now()}`,
      date: selectedCell.date,
      assigned_pa_id: selectedCell.paId,
      assigned_by_id: currentUserId,
      call_time: formattedCallTime,
      wrap_time: formattedWrapTime,
      confirmation_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setShifts((prev) => [...prev, optimisticShift]);

    try {
      const supabase = createClient();
      const shiftInsert: Database['public']['Tables']['shifts']['Insert'] = {
        date: selectedCell.date,
        assigned_pa_id: selectedCell.paId,
        assigned_by_id: currentUserId,
        call_time: formattedCallTime,
        wrap_time: formattedWrapTime,
        confirmation_status: 'pending',
      };

      const { data, error } = await (supabase
        .from('shifts') as any)
        .insert(shiftInsert)
        .select()
        .single();

      if (error) {
        console.error('Error creating shift:', error);
        throw error;
      }

      // Replace optimistic update with real data
      setShifts((prev) => prev.filter((s) => s.id !== optimisticShift.id).concat(data));

      // Send email notification to PA via API route
      try {
        // Fetch PA details (name and email)
        const paDetails = await getUserDetails(selectedCell.paId, supabase);

        // Fetch PC details (name) if needed
        let pcName: string | undefined;
        if (currentUserId) {
          const pcDetails = await getUserDetails(currentUserId, supabase);
          pcName = pcDetails?.name;
        }

        if (paDetails?.email) {
          const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              paEmail: paDetails.email,
              paName: paDetails.name,
              date: selectedCell.date,
              callTime: formattedCallTime,
              wrapTime: formattedWrapTime,
              pcName: pcName,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to send email');
          }
        } else {
          console.warn('Could not fetch PA email address for notification');
        }
      } catch (emailError) {
        // Log error but don't fail the shift assignment
        console.error('Failed to send shift assignment email:', emailError);
      }

      toast.success('Shift assigned successfully!');
      // Reset all state after successful assignment
      setIsAssignDialogOpen(false);
      setSelectedCell(null);
      setCallTime('');
      setWrapTime('');
      setLocation('');
    } catch (error) {
      console.error('Failed to create shift:', error);
      // Rollback optimistic update
      setShifts((prev) => prev.filter((s) => s.id !== optimisticShift.id));
      toast.error(`Failed to assign shift: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, selectedCell, callTime, wrapTime, formatTimeForDB]);

  const updateShift = useCallback(async () => {
    if (!selectedCell?.shift) {
      toast.error('No shift selected to update.');
      return;
    }

    setIsLoading(true);

    // Format times for database (HH:MM:SS)
    const formattedCallTime = formatTimeForDB(callTime);
    const formattedWrapTime = formatTimeForDB(wrapTime);

    // Optimistic update
    const originalShift = selectedCell.shift;
    const optimisticUpdate: Shift = {
      ...originalShift,
      call_time: formattedCallTime,
      wrap_time: formattedWrapTime,
      updated_at: new Date().toISOString(),
    };

    setShifts((prev) =>
      prev.map((shift) => (shift.id === originalShift.id ? optimisticUpdate : shift))
    );

    try {
      const supabase = createClient();
      const shiftUpdate: Database['public']['Tables']['shifts']['Update'] = {
        call_time: formattedCallTime,
        wrap_time: formattedWrapTime,
      };

      const { data, error } = await (supabase
        .from('shifts') as any)
        .update(shiftUpdate)
        .eq('id', originalShift.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating shift:', error);
        throw error;
      }

      // Replace optimistic update with real data from server
      if (data) {
        setShifts((prev) =>
          prev.map((shift) => (shift.id === originalShift.id ? data : shift))
        );
      }

      toast.success('Shift updated successfully!');
      // Reset all state after successful update
      setIsEditMode(false);
      setIsViewDialogOpen(false);
      setSelectedCell(null);
      setCallTime('');
      setWrapTime('');
      setLocation('');
    } catch (error) {
      console.error('Failed to update shift:', error);
      // Rollback optimistic update
      setShifts((prev) =>
        prev.map((shift) => (shift.id === originalShift.id ? originalShift : shift))
      );
      toast.error(`Failed to update shift: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCell, callTime, wrapTime, formatTimeForDB]);

  const deleteShift = useCallback(async () => {
    if (!selectedCell?.shift) {
      toast.error('No shift selected to remove.');
      return;
    }

    if (!confirm('Are you sure you want to remove this assignment?')) {
      return;
    }

    setIsLoading(true);

    // Optimistic update
    const shiftToDelete = selectedCell.shift;
    setShifts((prev) => prev.filter((shift) => shift.id !== shiftToDelete.id));

    try {
      const supabase = createClient();
      const { error } = await (supabase.from('shifts') as any).delete().eq('id', shiftToDelete.id);

      if (error) throw error;

      toast.success('Assignment removed successfully!');
      // Reset all state after successful deletion
      setIsViewDialogOpen(false);
      setSelectedCell(null);
      setIsEditMode(false);
      setCallTime('');
      setWrapTime('');
      setLocation('');
    } catch (error) {
      // Rollback optimistic update
      setShifts((prev) => [...prev, shiftToDelete]);
      toast.error(`Failed to remove assignment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCell]);

  // Week navigation functions - work with ISO date strings
  const goToPreviousWeek = useCallback(() => {
    setSelectedWeekMonday((prev) => addDaysToISO(prev, -7));
  }, []);

  const goToNextWeek = useCallback(() => {
    setSelectedWeekMonday((prev) => addDaysToISO(prev, 7));
  }, []);

  const goToCurrentWeek = useCallback(() => {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];
    setSelectedWeekMonday(getMondayOfWeekISO(todayISO));
  }, []);

  // Filter PAs based on filters
  const filteredPAs = useMemo(() => {
    return pas.filter((pa) => {
      if (showOnlyAvailable || showOnlyPreferred) {
        const hasMatchingAvailability = dates.some((dateInfo) => {
          const status = getAvailabilityStatus(pa.id, dateInfo.date, availability);
          if (showOnlyPreferred) {
            return status === 'preferred';
          }
          if (showOnlyAvailable) {
            return status === 'available' || status === 'preferred';
          }
          return false;
        });
        return hasMatchingAvailability;
      }
      return true;
    });
  }, [pas, dates, availability, showOnlyAvailable, showOnlyPreferred]);

  return (
    <div className="space-y-4">
      {/* Week Selector */}
      <div className="flex items-center justify-between p-4 bg-card border rounded-lg">
        <Button
          variant="outline"
          onClick={goToPreviousWeek}
          className="flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Previous Week
        </Button>

        <div className="text-center">
          <h2 className="text-lg font-semibold">
            {formatWeekDisplay(selectedWeekMonday)}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={goToCurrentWeek}
            className="text-sm"
          >
            Today
          </Button>
          <Button
            variant="outline"
            onClick={goToNextWeek}
            className="flex items-center gap-2"
          >
            Next Week
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center p-4 bg-card border rounded-lg">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyAvailable}
            onChange={(e) => setShowOnlyAvailable(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-sm font-medium">Show only available PAs</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyPreferred}
            onChange={(e) => setShowOnlyPreferred(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-sm font-medium">Show only preferred days</span>
        </label>
      </div>

      {/* Grid */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="sticky left-0 z-10 bg-muted border-r p-3 text-left font-semibold min-w-[200px]">
                    PA Name
                  </th>
                  {dates.map((dateInfo) => (
                    <th
                      key={dateInfo.date}
                      className="border-r p-3 text-center font-semibold min-w-[100px] last:border-r-0"
                    >
                      {dateInfo.display}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPAs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={dates.length + 1}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No PAs match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredPAs.map((pa) => (
                    <tr key={pa.id} className="border-t hover:bg-muted/50">
                      <td className="sticky left-0 z-10 bg-background border-r p-3 font-medium">
                        {pa.name}
                      </td>
                      {dates.map((dateInfo) => {
                        const status = getAvailabilityStatus(
                          pa.id,
                          dateInfo.date,
                          availability
                        );
                        const shift = getShiftForCell(pa.id, dateInfo.date, shifts);
                        const hasShift = !!shift;
                        const availabilityRecord = availability.find(
                          (a) => a.user_id === pa.id && a.date === dateInfo.date
                        );
                        const colorClass = getStatusColor(status, hasShift);
                        const label = getStatusLabel(status, hasShift);
                        // Cell is clickable if:
                        // 1. There's an existing shift (to view/edit it), OR
                        // 2. The availability status is 'available' (to assign new shift), OR
                        // 3. The availability status is 'preferred' (to assign new shift)
                        const isClickable =
                          hasShift || status === 'available' || status === 'preferred';

                        return (
                          <td
                            key={`${pa.id}-${dateInfo.date}`}
                            className="border-r p-2 text-center last:border-r-0"
                          >
                            <div
                              className={`inline-block px-2 py-1 rounded text-xs font-medium ${colorClass} ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
                                }`}
                              title={`${pa.name} - ${dateInfo.display}: ${label}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (isClickable) {
                                  handleCellClick(pa, dateInfo);
                                }
                              }}
                            >
                              {label}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 p-4 bg-card border rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary"></div>
          <span className="text-sm">Assigned</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500"></div>
          <span className="text-sm">Preferred</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-200"></div>
          <span className="text-sm">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-200"></div>
          <span className="text-sm">Unavailable</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gray-100"></div>
          <span className="text-sm">No data</span>
        </div>
      </div>

      {/* Assign Shift Dialog */}
      <Dialog
        open={isAssignDialogOpen}
        onOpenChange={(open) => {
          setIsAssignDialogOpen(open);
          if (!open) {
            // Reset all state when dialog closes
            setSelectedCell(null);
            setCallTime('');
            setWrapTime('');
            setLocation('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign Shift</DialogTitle>
            <DialogDescription>
              Assign a shift to {selectedCell?.paName} on {selectedCell?.dateDisplay}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>PA Name</Label>
              <div className="text-sm font-medium">{selectedCell?.paName}</div>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <div className="text-sm font-medium">{selectedCell?.dateDisplay}</div>
            </div>
            {selectedCell?.paNote && (
              <div className="space-y-2">
                <Label>PA Note</Label>
                <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
                  {selectedCell.paNote}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="call-time">Call Time</Label>
              <Input
                id="call-time"
                type="time"
                value={callTime}
                onChange={(e) => setCallTime(e.target.value)}
                placeholder="HH:MM"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wrap-time">Wrap Time</Label>
              <Input
                id="wrap-time"
                type="time"
                value={wrapTime}
                onChange={(e) => setWrapTime(e.target.value)}
                placeholder="HH:MM"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Enter location"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAssignDialogOpen(false);
                setSelectedCell(null);
                setCallTime('');
                setWrapTime('');
                setLocation('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={createShift} disabled={isLoading}>
              {isLoading ? 'Assigning...' : 'Assign Shift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View/Edit Shift Dialog */}
      <Dialog
        open={isViewDialogOpen}
        onOpenChange={(open) => {
          setIsViewDialogOpen(open);
          if (!open) {
            // Reset all state when dialog closes
            setSelectedCell(null);
            setIsEditMode(false);
            setCallTime('');
            setWrapTime('');
            setLocation('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Shift' : 'Shift Details'}</DialogTitle>
            <DialogDescription>
              {selectedCell?.paName} - {selectedCell?.dateDisplay}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!isEditMode ? (
              <>
                <div className="space-y-2">
                  <Label>PA Name</Label>
                  <div className="text-sm font-medium">{selectedCell?.paName}</div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <div className="text-sm font-medium">{selectedCell?.dateDisplay}</div>
                </div>
                <div className="space-y-2">
                  <Label>Call Time</Label>
                  <div className="text-sm">
                    {selectedCell?.shift?.call_time || 'Not set'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Wrap Time</Label>
                  <div className="text-sm">
                    {selectedCell?.shift?.wrap_time || 'Not set'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirmation Status</Label>
                  <div
                    className={`text-sm font-medium ${getConfirmationStatusColor(
                      selectedCell?.shift?.confirmation_status || 'pending'
                    )}`}
                  >
                    {selectedCell?.shift?.confirmation_status
                      ? selectedCell.shift.confirmation_status.charAt(0).toUpperCase() +
                      selectedCell.shift.confirmation_status.slice(1)
                      : 'Pending'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-call-time">Call Time</Label>
                  <Input
                    id="edit-call-time"
                    type="time"
                    value={callTime}
                    onChange={(e) => setCallTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-wrap-time">Wrap Time</Label>
                  <Input
                    id="edit-wrap-time"
                    type="time"
                    value={wrapTime}
                    onChange={(e) => setWrapTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-location">Location</Label>
                  <Input
                    id="edit-location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Enter location"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirmation Status</Label>
                  <div
                    className={`text-sm font-medium ${getConfirmationStatusColor(
                      selectedCell?.shift?.confirmation_status || 'pending'
                    )}`}
                  >
                    {selectedCell?.shift?.confirmation_status
                      ? selectedCell.shift.confirmation_status.charAt(0).toUpperCase() +
                      selectedCell.shift.confirmation_status.slice(1)
                      : 'Pending'}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            {!isEditMode ? (
              <>
                <Button
                  variant="destructive"
                  onClick={deleteShift}
                  disabled={isLoading}
                >
                  {isLoading ? 'Removing...' : 'Remove Assignment'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsViewDialogOpen(false);
                    setSelectedCell(null);
                    setIsEditMode(false);
                    setCallTime('');
                    setWrapTime('');
                    setLocation('');
                  }}
                >
                  Close
                </Button>
                <Button onClick={() => setIsEditMode(true)}>Edit Shift</Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditMode(false);
                    if (selectedCell?.shift) {
                      setCallTime(selectedCell.shift.call_time || '');
                      setWrapTime(selectedCell.shift.wrap_time || '');
                    }
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={updateShift} disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
