import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { code } = await request.json();
  
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('productions')
    .select('id')
    .eq('invite_code', code.toUpperCase())
    .eq('is_active', true)
    .single();
  
  if (error || !data) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }
  
  return NextResponse.json({ valid: true, productionId: data.id }, { status: 200 });
}

