'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function LogoutButton() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleLogout = async () => {
        setIsLoading(true);
        try {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.push('/login');
        } catch (error) {
            console.error('Error signing out:', error);
            setIsLoading(false);
        }
    };

    return (
        <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            disabled={isLoading}
        >
            {isLoading ? 'Logging out...' : 'Logout'}
        </Button>
    );
}

