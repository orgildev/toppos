import { NextResponse } from 'next/server';
import { getDbConnection, getDbConfig } from '@/lib/db';

export async function GET() {
  const config = getDbConfig();
  try {
    const pool = await getDbConnection();
    
    // Fetch categories
    const categoriesResult = await pool.request().query(`
      SELECT ID, CatName, PrintOrder 
      FROM tblCategory 
      ORDER BY PrintOrder, CatName
    `);

    // Fetch items with sizes and prices
    const itemsResult = await pool.request().query(`
      SELECT i.ID as ItemID, i.CategoryID, i.IName as ItemName, i.IName2 as ItemName2, 
             i.OnlineItem, i.ScaleItem, i.ManageInv, i.Alcohol,
             a.SizeID, s.SizeName, a.UnitPrice, a.UnitPrice2, a.UnitPrice3
      FROM tblItem i
      LEFT JOIN tblAvailableSize a ON a.ItemID = i.ID
      LEFT JOIN tblSize s ON a.SizeID = s.ID
      WHERE i.Status = 1
      ORDER BY i.CategoryID, i.IName
    `);

    const categories = categoriesResult.recordset.map(cat => ({
      id: cat.ID,
      name: cat.CatName,
      order: cat.PrintOrder,
      items: []
    }));

    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.id] = cat;
    });

    itemsResult.recordset.forEach(item => {
      const cat = categoryMap[item.CategoryID];
      if (!cat) return; // Skip if category is not active/defined

      let itemObj = cat.items.find(i => i.id === item.ItemID);
      if (!itemObj) {
        itemObj = {
          id: item.ItemID,
          name: item.ItemName,
          name2: item.ItemName2 || '',
          onlineItem: item.OnlineItem,
          scaleItem: item.ScaleItem,
          manageInv: item.ManageInv,
          alcohol: item.Alcohol,
          sizes: []
        };
        cat.items.push(itemObj);
      }

      if (item.SizeID !== null && item.SizeID !== undefined) {
        itemObj.sizes.push({
          sizeId: item.SizeID,
          sizeName: item.SizeName || 'Regular',
          price: item.UnitPrice || 0,
          price2: item.UnitPrice2 || 0,
          price3: item.UnitPrice3 || 0
        });
      }
    });

    // Sort items inside categories by name
    categories.forEach(cat => {
      cat.items.sort((a, b) => a.name.localeCompare(b.name));
    });

    return NextResponse.json({ success: true, categories });
  } catch (err) {
    console.error('API Menu error:', err);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to connect to the POS database. Please check connection settings.', 
      error: err.message,
      serverIp: config.server
    }, { status: 500 });
  }
}
