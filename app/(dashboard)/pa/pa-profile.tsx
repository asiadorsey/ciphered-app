'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type User = Database['public']['Tables']['users']['Row'];

interface PAProfileProps {
    user: User;
}

export function PAProfile({ user: initialUser }: PAProfileProps) {
    const [user, setUser] = useState<User>(initialUser);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    
    // Form state
    const [phone, setPhone] = useState(user.phone || '');

    const handleSave = useCallback(async () => {
        setIsLoading(true);

        // Optimistic update
        const previousUser = user;
        setUser({
            ...user,
            phone: phone || null,
        });

        try {
            const supabase = createClient();
            const { error } = await supabase
                .from('users')
                .update({
                    phone: phone || null,
                })
                .eq('id', user.id);

            if (error) throw error;

            toast.success('Profile updated successfully!');
            setIsEditing(false);
        } catch (error) {
            // Rollback
            setUser(previousUser);
            toast.error(
                `Failed to update profile: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            setIsLoading(false);
        }
    }, [user, phone]);

    const handleCancel = useCallback(() => {
        setPhone(user.phone || '');
        setIsEditing(false);
    }, [user]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">My Profile</h2>
                {!isEditing && (
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        Edit
                    </Button>
                )}
            </div>

            <div className="p-6 border rounded-lg bg-card space-y-6">
                {/* Basic Info (Read-only) */}
                <div className="space-y-2">
                    <Label>Name</Label>
                    <div className="text-sm font-medium">{user.name}</div>
                </div>

                <div className="space-y-2">
                    <Label>Email</Label>
                    <div className="text-sm font-medium">{user.email}</div>
                </div>

                {/* Phone (Editable) */}
                <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    {isEditing ? (
                        <Input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="(555) 123-4567"
                        />
                    ) : (
                        <div className="text-sm font-medium">{phone || 'Not provided'}</div>
                    )}
                </div>

                {/* Action Buttons */}
                {isEditing && (
                    <div className="flex gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isLoading}>
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

