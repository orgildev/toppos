import { NextResponse } from 'next/server';
import { getDbConnection, getDbConfig } from '@/lib/db';

export async function GET() {
  const config = getDbConfig();
  try {
    const pool = await getDbConnection();
    
    // Fetch categories from tblMenuLayout (Level 0)
    const categoriesResult = await pool.request().query(`
      SELECT TabIndex as ID, Caption as CatName
      FROM tblMenuLayout
      WHERE Level = 0
      ORDER BY TabIndex
    `);

    // Fetch items with sizes and prices in the layout order (Level 1)
    const itemsResult = await pool.request().query(`
      SELECT l.TabIndex as CategoryID, l.ControlIndex, l.ItemID, 
             i.IName as ItemName, i.IName2 as ItemName2, 
             i.OnlineItem, i.ScaleItem, i.ManageInv, i.Alcohol,
             i.Taste as Taste, i.OpenItem as OpenItem,
             a.SizeID, s.SizeName, a.UnitPrice, a.UnitPrice2, a.UnitPrice3
      FROM tblMenuLayout l
      INNER JOIN tblItem i ON l.ItemID = i.ID
      LEFT JOIN tblAvailableSize a ON a.ItemID = i.ID
      LEFT JOIN tblSize s ON a.SizeID = s.ID
      WHERE l.Level = 1 AND l.ItemID > 0 AND i.Status = 1
      ORDER BY l.TabIndex, l.ControlIndex, a.SizeID
    `);

    const categories = categoriesResult.recordset.map(cat => ({
      id: cat.ID,
      name: (cat.CatName || '').trim() || `Tab #${cat.ID}`,
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
          taste: item.Taste,
          openItem: item.OpenItem,
          sizes: []
        };
        cat.items.push(itemObj);
      }

      if (item.SizeID !== null && item.SizeID !== undefined) {
        // Ensure size is not duplicated due to joins
        const sizeExists = itemObj.sizes.some(sz => sz.sizeId === item.SizeID);
        if (!sizeExists) {
          itemObj.sizes.push({
            sizeId: item.SizeID,
            sizeName: item.SizeName || 'Regular',
            price: item.UnitPrice || 0,
            price2: item.UnitPrice2 || 0,
            price3: item.UnitPrice3 || 0
          });
        }
      }
    });

    // Reorder items: put food items first, option/modifier items at the bottom,
    // preserving their original relative ordering.
    categories.forEach(cat => {
      const foodItems = [];
      const optionItems = [];

      cat.items.forEach(item => {
        const name = (item.name || '').toLowerCase();
        const isOption = item.taste || 
                         item.openItem || 
                         name.startsWith('add ') || 
                         name.startsWith('no ') || 
                         name.startsWith('ex ') || 
                         name.includes('option') || 
                         name.includes('on top') || 
                         name === 'togo' || 
                         name === 'sub charge' || 
                         name === 'open food' ||
                         name === 'togo box' ||
                         name === 'real crab' ||
                         name === 'paper bag' ||
                         name === 'make it spicy' ||
                         name === 'make it spicy for kitchen';
        
        item.isOption = !!isOption;
        if (isOption) {
          optionItems.push(item);
        } else {
          foodItems.push(item);
        }
      });

      cat.items = [...foodItems, ...optionItems];
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
