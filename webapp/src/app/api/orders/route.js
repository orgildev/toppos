import { NextResponse } from 'next/server';
import { getDbConnection, getDbConfig } from '@/lib/db';
import sql from 'mssql';

export async function POST(request) {
  try {
    const { tableId, takeOut, items, customer } = await request.json();
    
    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, message: 'Cart is empty.' }, { status: 400 });
    }

    const pool = await getDbConnection();
    const config = getDbConfig();
    const serverId = config.serverId || 64;

    const transaction = pool.transaction();

    await transaction.begin();

    try {
      let salesID = 0;
      const isTakeOut = takeOut ? 1 : 0;
      const targetTableId = tableId || 0;

      // 1. Get next DailyOrderNumber using stored procedure sp_GetDailyOrderNumber
      const dailyOrderReq = transaction.request();
      dailyOrderReq.input('UseSpecialOrderNumberSequence', sql.Bit, 0);
      dailyOrderReq.input('LastDigitOfOrderNumberSequence', sql.Int, 0);
      dailyOrderReq.output('DailyOrderNumber', sql.Int);
      const dailyOrderRes = await dailyOrderReq.execute('sp_GetDailyOrderNumber');
      const dailyOrderNum = dailyOrderRes.output.DailyOrderNumber || 0;

      // 2. Check if the table is already open
      let existingOrderResult = null;
      if (targetTableId > 0 && !takeOut) {
        existingOrderResult = await transaction.request()
          .input('tableId', targetTableId)
          .query(`
            SELECT OrderNum 
            FROM tblTable 
            WHERE ID = @tableId AND OrderNum > 0
          `);
      }

      if (existingOrderResult && existingOrderResult.recordset.length > 0) {
        salesID = existingOrderResult.recordset[0].OrderNum;
        
        // Check if the previous print cue has already been completed/printed
        const printCueStatusResult = await transaction.request()
          .input('salesId', salesID)
          .query(`
            SELECT PrintedStatus FROM tblOrderPrintCue WHERE SalesID = @salesId
          `);
        
        const isAlreadyPrinted = printCueStatusResult.recordset.length === 0 || 
                                 printCueStatusResult.recordset[0].PrintedStatus !== 0;
        
        if (isAlreadyPrinted) {
          // Move existing items from tblPendingOrders to tblPendingOrdersBackup
          await transaction.request()
            .input('salesId', salesID)
            .query(`
              INSERT INTO tblPendingOrdersBackup (
                SalesID, ItemID, SizeID, Qty, UnitPrice, Tastes, SideDishes, ItemName, SizeName, 
                ApplyGST, ApplyPST, DSCAmt, KitchenB, KitchenF, PersonIndex, SeparateBillPrint, 
                Bar, ApplyNoDSC, OpenItem, ItemName2, ExtraChargeItem, ApplyPST2, KitchenE,  
                DSCAmtEmployee, DSCAmtType1, DSCAmtType2, Status, DayHourDiscountRate, PricePerWeightUnit, 
                MeasuredWeight, DecimalPlaces, DiscountPercent, Kitchen5, Kitchen6
              )
              SELECT 
                p.SalesID, p.ItemID, p.SizeID, p.Qty, p.UnitPrice, p.Tastes, p.SideDishes, p.ItemName, p.SizeName, 
                p.ApplyGST, p.ApplyPST, p.DSCAmt, p.KitchenB, p.KitchenF, p.PersonIndex, p.SeparateBillPrint, 
                p.Bar, p.ApplyNoDSC, p.OpenItem, p.ItemName2, p.ExtraChargeItem, p.ApplyPST2, p.KitchenE,  
                p.DSCAmtEmployee, p.DSCAmtType1, p.DSCAmtType2, p.Status, p.DayHourDiscountRate, p.PricePerWeightUnit, 
                p.MeasuredWeight, p.DecimalPlaces, p.DiscountPercent, p.Kitchen5, p.Kitchen6
              FROM tblPendingOrders p
              WHERE p.SalesID = @salesId
                AND NOT EXISTS (
                  SELECT 1 FROM tblPendingOrdersBackup b
                  WHERE b.SalesID = p.SalesID 
                    AND b.ItemID = p.ItemID 
                    AND b.SizeID = p.SizeID 
                    AND b.PersonIndex = p.PersonIndex
                    AND b.Tastes = p.Tastes
                );

              SET CONTEXT_INFO 0x1234;
              DELETE FROM tblPendingOrders
              WHERE SalesID = @salesId;
              SET CONTEXT_INFO 0x0;
            `);
        }
      } else {
        // 3. Open a new order
        // Insert into tblSales to generate a new SalesID (TransType 1 = Pending)
        const salesInsertResult = await transaction.request()
          .input('takeOut', isTakeOut)
          .input('tableId', targetTableId)
          .input('cashierId', serverId)
          .input('dailyOrderNum', dailyOrderNum)
          .query(`
            INSERT INTO tblSales (
              CashierID, SaleDateTime, SubTotal, DSCAmt, GSTAmt, PSTAmt, PST2Amt, 
              TransType, OriginalTransType, Guests, CustomerID, DailyOrderNumber, 
              GSTRate, PSTRate, PST2Rate, TakeOutOrder, TableID, StationID, 
              CustomerTypeID, CustomerGroupID
            )
            OUTPUT INSERTED.ID
            VALUES (
              @cashierId, GETDATE(), 0, 0, 0, 0, 0, 
              1, 1, 1, 1, @dailyOrderNum, 
              0.05, 0.1, 0.07, @takeOut, @tableId, 1, 
              1, 1
            )
          `);
        
        salesID = salesInsertResult.recordset[0].ID;
      }

      // 4. Query item properties from tblItem and insert items into tblPendingOrders
      let totalAmt = 0;
      let currentPersonIndex = 0;

      for (const item of items) {
        if (item.isSeparator) {
          const match = item.name.match(/Person\s+(\d+)/i);
          if (match) {
            currentPersonIndex = Math.max(0, parseInt(match[1]) - 1);
          } else {
            currentPersonIndex++;
          }
          continue; // Do not insert the separator item itself into the database
        }

        // Fetch properties (ApplyGST, ApplyPST, ApplyPST2, KitchenB, KitchenF, etc.)
        const itemDetailsResult = await transaction.request()
          .input('itemId', item.itemId)
          .query(`
            SELECT ApplyGST, ApplyPST, ApplyPST2, KitchenB, KitchenF, KitchenE, Kitchen5, Kitchen6 
            FROM tblItem 
            WHERE ID = @itemId
          `);
        
        const itemDetails = itemDetailsResult.recordset[0] || {
          ApplyGST: true,
          ApplyPST: false,
          ApplyPST2: false,
          KitchenB: false,
          KitchenF: true,
          KitchenE: false,
          Kitchen5: false,
          Kitchen6: false
        };

        const qty = parseFloat(item.qty) || 1;
        const price = parseFloat(item.price) || 0;
        const subtotal = price * qty;
        
        let gstAmt = 0;
        let pstAmt = 0;
        let pst2Amt = 0;
        
        if (itemDetails.ApplyGST) gstAmt = subtotal * 0.05;
        if (itemDetails.ApplyPST) pstAmt = subtotal * 0.10;
        if (itemDetails.ApplyPST2) pst2Amt = subtotal * 0.07;
        
        totalAmt += subtotal + gstAmt + pstAmt + pst2Amt;

        // Query the size name from tblSize for this sizeId
        const sizeResult = await transaction.request()
          .input('sizeId', item.sizeId)
          .query(`
            SELECT SizeName FROM tblSize WHERE ID = @sizeId
          `);
        const sizeName = sizeResult.recordset[0]?.SizeName || 'NoSize';

        await transaction.request()
          .input('salesId', salesID)
          .input('itemId', item.itemId)
          .input('sizeId', item.sizeId)
          .input('qty', item.qty)
          .input('unitPrice', item.price)
          .input('itemName', item.name)
          .input('itemName2', item.name2 || '')
          .input('sizeName', sizeName)
          .input('applyGST', itemDetails.ApplyGST ? 1 : 0)
          .input('applyPST', itemDetails.ApplyPST ? 1 : 0)
          .input('applyPST2', itemDetails.ApplyPST2 ? 1 : 0)
          .input('kitchenB', itemDetails.KitchenB ? 1 : 0)
          .input('kitchenF', itemDetails.KitchenF ? 1 : 0)
          .input('kitchenE', itemDetails.KitchenE ? 1 : 0)
          .input('kitchen5', itemDetails.Kitchen5 ? 1 : 0)
          .input('kitchen6', itemDetails.Kitchen6 ? 1 : 0)
          .input('personIndex', currentPersonIndex)
          .query(`
            INSERT INTO tblPendingOrders (
              SalesID, ItemID, SizeID, Qty, UnitPrice, Tastes, SideDishes, 
              ItemName, SizeName, ApplyGST, ApplyPST, DSCAmt, KitchenB, KitchenF, 
              PersonIndex, SeparateBillPrint, Bar, ApplyNoDSC, OpenItem, ItemName2, 
              ExtraChargeItem, ApplyPST2, KitchenE, DSCAmtEmployee, DSCAmtType1, 
              DSCAmtType2, DayHourDiscountRate, PricePerWeightUnit, MeasuredWeight, 
              DecimalPlaces, DiscountPercent, Kitchen5, Kitchen6
            )
            VALUES (
              @salesId, @itemId, @sizeId, @qty, @unitPrice, '', '', 
              @itemName, @sizeName, @applyGST, @applyPST, 0, @kitchenB, @kitchenF, 
              @personIndex, 0, 0, 0, 0, @itemName2, 
              0, @applyPST2, @kitchenE, 0, 0, 
              0, 0, 0, 0, 0, 0, @kitchen5, @kitchen6
            )
          `);
      }

      // 5. Update the table status to link the OrderNum, DailyOrdNum, and TotalAmt (keep Opened = 0 to prevent locking)
      if (targetTableId > 0 && !takeOut) {
        await transaction.request()
          .input('tableId', targetTableId)
          .input('salesId', salesID)
          .input('serverId', serverId)
          .input('dailyOrderNum', dailyOrderNum)
          .query(`
            UPDATE tblTable
            SET Opened = 0, OrderNum = @salesId, ServerID = @serverId, 
                TimeIn = GETDATE(), DailyOrdNum = @dailyOrderNum,
                TotalAmt = COALESCE((
                  SELECT SUM(Qty * UnitPrice + 
                             CASE WHEN ApplyGST = 1 THEN Qty * UnitPrice * 0.05 ELSE 0 END + 
                             CASE WHEN ApplyPST = 1 THEN Qty * UnitPrice * 0.10 ELSE 0 END + 
                             CASE WHEN ApplyPST2 = 1 THEN Qty * UnitPrice * 0.07 ELSE 0 END)
                  FROM tblPendingOrders
                  WHERE SalesID = @salesId
                ), 0)
            WHERE ID = @tableId
          `);
      } else if (takeOut) {
        // If takeout, we find the first open takeout virtual table and associate it
        const takeoutTableResult = await transaction.request().query(`
          SELECT TOP 1 ID FROM tblTable 
          WHERE TakeOut = 1 AND Opened = 0 AND OrderNum = 0
          ORDER BY ID
        `);
        if (takeoutTableResult.recordset.length > 0) {
          const takeoutTableId = takeoutTableResult.recordset[0].ID;
          await transaction.request()
            .input('tableId', takeoutTableId)
            .input('salesId', salesID)
            .input('serverId', serverId)
            .input('pickupName', customer?.name || 'TAKEOUT')
            .input('dailyOrderNum', dailyOrderNum)
            .query(`
              UPDATE tblTable
              SET Opened = 0, OrderNum = @salesId, ServerID = @serverId, 
                  TimeIn = GETDATE(), PickupPerson = @pickupName, 
                  DailyOrdNum = @dailyOrderNum,
                  TotalAmt = COALESCE((
                    SELECT SUM(Qty * UnitPrice + 
                               CASE WHEN ApplyGST = 1 THEN Qty * UnitPrice * 0.05 ELSE 0 END + 
                               CASE WHEN ApplyPST = 1 THEN Qty * UnitPrice * 0.10 ELSE 0 END + 
                               CASE WHEN ApplyPST2 = 1 THEN Qty * UnitPrice * 0.07 ELSE 0 END)
                    FROM tblPendingOrders
                    WHERE SalesID = @salesId
                  ), 0)
              WHERE ID = @tableId
            `);
        }
      }

      // 6. Insert/Update print cue so the kitchen printer automatically triggers
      const checkPrintResult = await transaction.request()
        .input('salesId', salesID)
        .query(`
          SELECT SalesID FROM tblOrderPrintCue WHERE SalesID = @salesId
        `);

      if (checkPrintResult.recordset.length > 0) {
        await transaction.request()
          .input('salesId', salesID)
          .query(`
            UPDATE tblOrderPrintCue
            SET PrintedStatus = 0, PrintDateTime = GETDATE(), DateTimeIn = GETDATE(), IsReprinting = 0
            WHERE SalesID = @salesId
          `);
      } else {
        await transaction.request()
          .input('salesId', salesID)
          .query(`
            INSERT INTO tblOrderPrintCue (SalesID, PrintDateTime, PrintedStatus, DateTimeIn, IsReprinting)
            VALUES (@salesId, GETDATE(), 0, GETDATE(), 0)
          `);
      }

      await transaction.commit();
      return NextResponse.json({ success: true, salesId: salesID, message: 'Order submitted successfully.' });

    } catch (err) {
      await transaction.rollback();
      throw err;
    }

  } catch (err) {
    console.error('API Order submit error:', err);
    return NextResponse.json({ success: false, message: 'Failed to submit order to database.', error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tableId = searchParams.get('tableId');
    const salesId = searchParams.get('salesId');

    if (!tableId && !salesId) {
      return NextResponse.json({ success: false, message: 'Missing tableId or salesId.' }, { status: 400 });
    }

    const pool = await getDbConnection();
    let targetSalesId = null;

    if (salesId) {
      targetSalesId = parseInt(salesId);
    } else if (tableId) {
      // Find active OrderNum for the table
      const tableRes = await pool.request()
        .input('tableId', parseInt(tableId))
        .query(`
          SELECT OrderNum 
          FROM tblTable 
          WHERE ID = @tableId
        `);
      if (tableRes.recordset.length > 0) {
        targetSalesId = tableRes.recordset[0].OrderNum;
      }
    }

    if (!targetSalesId || targetSalesId <= 0) {
      return NextResponse.json({ success: true, items: [] });
    }

    // Query items from both tblPendingOrders and tblSalesDetail (archived items)
    const itemsRes = await pool.request()
      .input('salesId', targetSalesId)
      .query(`
        SELECT ItemID, SizeID, Qty, UnitPrice, ItemName, ItemName2, SizeName, COALESCE(PersonIndex, 0) AS PersonIndex
        FROM tblPendingOrders
        WHERE SalesID = @salesId
        UNION ALL
        SELECT ItemID, SizeID, Qty, UnitPrice, ItemName, ItemName2, SizeName, 0 AS PersonIndex
        FROM tblSalesDetail
        WHERE SalesID = @salesId AND Voided = 0
        ORDER BY PersonIndex
      `);

    const dbItems = itemsRes.recordset;
    
    // Check if there's any item belonging to Person 2 or higher (PersonIndex > 0)
    const hasMultiplePersons = dbItems.some(row => row.PersonIndex > 0);
    
    const items = [];
    let lastPersonIndex = -1;
    let virtualId = 1;

    for (const row of dbItems) {
      const personIndex = row.PersonIndex;
      
      // If we have multiple persons, insert a virtual separator row when the PersonIndex changes
      if (hasMultiplePersons && personIndex !== lastPersonIndex) {
        lastPersonIndex = personIndex;
        const personNum = personIndex + 1;
        items.push({
          id: `sep-${personIndex}-${virtualId++}`,
          itemId: 0,
          sizeId: 0,
          qty: 0,
          price: 0,
          name: `--- Person ${personNum} ---`,
          name2: '',
          sizeName: '',
          isSeparator: true
        });
      }
      
      items.push({
        id: virtualId++,
        itemId: row.ItemID,
        sizeId: row.SizeID,
        qty: row.Qty,
        price: row.UnitPrice,
        name: row.ItemName,
        name2: row.ItemName2,
        sizeName: row.SizeName,
        personIndex: personIndex
      });
    }

    return NextResponse.json({ success: true, items });
  } catch (err) {
    console.error('API Get Active Orders error:', err);
    return NextResponse.json({ success: false, message: 'Failed to retrieve active order items.', error: err.message }, { status: 500 });
  }
}

