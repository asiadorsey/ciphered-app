'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function PCRealtimeSubscriptions() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('pc-dashboard-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability' },
        () => {
          // Refetch availability data
          router.refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
          // Refetch shifts data
          router.refresh();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Error subscribing to PC dashboard updates');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}

