import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export async function POST(request) {
  try {
    const { tableId, takeOut, items, customer } = await request.json();
    
    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, message: 'Cart is empty.' }, { status: 400 });
    }

    const pool = await getDbConnection();
    const transaction = pool.transaction();

    await transaction.begin();

    try {
      let salesID = 0;
      const isTakeOut = takeOut ? 1 : 0;
      const targetTableId = tableId || 0;

      // 1. Check if the table is already open
      let existingOrderResult = null;
      if (targetTableId > 0 && !takeOut) {
        existingOrderResult = await transaction.request()
          .input('tableId', targetTableId)
          .query(`
            SELECT OrderNum 
            FROM tblTable 
            WHERE ID = @tableId AND Opened = 1 AND OrderNum > 0
          `);
      }

      if (existingOrderResult && existingOrderResult.recordset.length > 0) {
        salesID = existingOrderResult.recordset[0].OrderNum;
      } else {
        // 2. Open a new order
        // Insert into tblSales to generate a new SalesID (TransType 1 = Pending)
        const salesInsertResult = await transaction.request()
          .input('takeOut', isTakeOut)
          .input('tableId', targetTableId)
          .query(`
            INSERT INTO tblSales (
              CashierID, SaleDateTime, SubTotal, DSCAmt, GSTAmt, PSTAmt, PST2Amt, 
              TransType, OriginalTransType, Guests, CustomerID, DailyOrderNumber, 
              GSTRate, PSTRate, PST2Rate, TakeOutOrder, TableID, StationID, 
              CustomerTypeID, CustomerGroupID
            )
            OUTPUT INSERTED.ID
            VALUES (
              1, GETDATE(), 0, 0, 0, 0, 0, 
              1, 1, 1, 0, 0, 
              0.05, 0.07, 0, @takeOut, @tableId, 1, 
              0, 0
            )
          `);
        
        salesID = salesInsertResult.recordset[0].ID;

        // 3. Update the table status to Opened and link the OrderNum (if dine-in)
        if (targetTableId > 0 && !takeOut) {
          await transaction.request()
            .input('tableId', targetTableId)
            .input('salesId', salesID)
            .query(`
              UPDATE tblTable
              SET Opened = 1, OrderNum = @salesId, ServerID = 1, OpenedDateTime = GETDATE()
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
              .input('pickupName', customer?.name || 'TAKEOUT')
              .query(`
                UPDATE tblTable
                SET Opened = 1, OrderNum = @salesId, ServerID = 1, OpenedDateTime = GETDATE(), PickupPerson = @pickupName
                WHERE ID = @tableId
              `);
          }
        }
      }

      // 4. Insert items into tblPendingOrders
      for (const item of items) {
        await transaction.request()
          .input('salesId', salesID)
          .input('itemId', item.itemId)
          .input('sizeId', item.sizeId)
          .input('qty', item.qty)
          .input('unitPrice', item.price)
          .input('itemName', item.name)
          .input('itemName2', item.name2 || '')
          .input('sizeName', item.sizeName || 'Regular')
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
              @itemName, @sizeName, 1, 1, 0, 1, 1, 
              1, 0, 0, 0, 0, @itemName2, 
              0, 0, 1, 0, 0, 
              0, 0, 0, 0, 0, 0, 1, 1
            )
          `);
      }

      // 5. Insert/Update print cue so the kitchen printer automatically triggers
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
            SET PrintedStatus = 0, PrintDateTime = GETDATE(), DateTimeIn = GETDATE(), IsReprinting = 1
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
