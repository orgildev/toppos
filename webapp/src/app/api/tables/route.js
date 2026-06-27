import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export async function GET() {
  try {
    const pool = await getDbConnection();
    
    // Fetch tables
    const result = await pool.request().query(`
      SELECT t.ID, t.TableName, t.Opened, t.OrderNum, t.Linked, t.TakeOut,
             tl.AlignLeft, tl.AlignTop, tl.Width, tl.Height, tl.Caption
      FROM tblTable t
        INNER JOIN tblTableLayout tl ON t.ID = tl.TableID AND tl.LayoutModeType = 1
      WHERE t.ID <= 24 AND t.ID > 0
      ORDER BY t.ID
    `);

    const tables = result.recordset.map(row => ({
      id: row.ID,
      name: row.TableName || `#${row.ID}`,
      opened: !!(row.Opened || row.OrderNum > 0),
      orderNum: row.OrderNum,
      linked: row.Linked,
      takeOut: row.TakeOut,
      alignLeft: row.AlignLeft,
      alignTop: row.AlignTop,
      width: row.Width,
      height: row.Height,
      caption: row.Caption ? row.Caption.replace(/\r\n/g, ' ') : null
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
