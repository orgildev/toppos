import { NextResponse } from 'next/server';
import { getDbConfig, saveDbConfig } from '@/lib/db';

export async function GET() {
  const config = getDbConfig();
  // Mask the password for security
  const safeConfig = { ...config, password: config.password ? '********' : '' };
  return NextResponse.json(safeConfig);
}

export async function POST(request) {
  try {
    const newConfig = await request.json();
    const currentConfig = getDbConfig();
    
    // If password is still masked, keep the original password
    if (newConfig.password === '********') {
      newConfig.password = currentConfig.password;
    }

    const success = await saveDbConfig(newConfig);
    if (success) {
      return NextResponse.json({ success: true, message: 'Configuration saved successfully.' });
    } else {
      return NextResponse.json({ success: false, message: 'Failed to write configuration file.' }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 400 });
  }
}
