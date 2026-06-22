import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export async function GET() {
  try {
    const pool = await getDbConnection();
    
    // Fetch tables
    const result = await pool.request().query(`
      SELECT ID, TableName, Opened, OrderNum, Linked, TakeOut
      FROM tblTable
      WHERE (ID <= 200 OR (ID > 300 AND ID <= 1998))
      ORDER BY ID
    `);

    const tables = result.recordset.map(row => ({
      id: row.ID,
      name: row.TableName || `#${row.ID}`,
      opened: row.Opened,
      orderNum: row.OrderNum,
      linked: row.Linked,
      takeOut: row.TakeOut
    }));

    return NextResponse.json({ success: true, tables });
  } catch (err) {
    console.error('API Tables error:', err);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to retrieve tables from database.', 
      error: err.message 
    }, { status: 500 });
  }
}
