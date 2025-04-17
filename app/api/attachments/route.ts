import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(`${Date.now()}-${file.name}`, file);

    if (error) {
      throw error;
    }

    return NextResponse.json({ 
      url: data.path,
      success: true 
    });

  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: error.message || 'Error uploading file' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const url = new URL(req.url);
    const path = url.searchParams.get('path');

    if (!path) {
      return NextResponse.json(
        { error: 'No file path provided' },
        { status: 400 }
      );
    }

    // Get file from Supabase Storage
    const { data, error } = await supabase.storage
      .from('attachments')
      .download(path);

    if (error) {
      throw error;
    }

    // Return file as stream
    return new NextResponse(data, {
      headers: {
        'Content-Type': data.type,
      },
    });

  } catch (error: any) {
    console.error('Error fetching file:', error);
    return NextResponse.json(
      { error: error.message || 'Error fetching file' },
      { status: 500 }
    );
  }
} 