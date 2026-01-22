'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function PARealtimeSubscriptions() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
      }
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();

    const channel = supabase
      .channel('pa-dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'availability',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Refetch availability data for this user
          router.refresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
          filter: `assigned_pa_id=eq.${userId}`,
        },
        () => {
          // Refetch shifts data for this user
          router.refresh();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Error subscribing to PA dashboard updates');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}

