import net from 'net';

const PRINTERS = {
  backKitchen: '192.168.0.200',
  sushiBar: '192.168.0.201'
};

/**
 * Format a kitchen ticket using Epson ESC/POS commands
 */
function formatKitchenTicket(title, orderNum, tableName, isTakeOut, customerName, items) {
  const ESC = '\x1b';
  const GS = '\x1d';

  let p = '';
  p += ESC + '@'; // Initialize printer
  p += ESC + 'a\x01'; // Center alignment
  
  // Header: Large text
  p += GS + '!\x11'; // Double height and double width
  p += `* ${title.toUpperCase()} *\n`;
  p += `ORDER: #${orderNum}\n`;
  
  if (isTakeOut) {
    p += `TAKEOUT\n`;
    if (customerName) {
      p += `${customerName.toUpperCase()}\n`;
    }
  } else {
    p += `TABLE: ${tableName}\n`;
  }
  
  p += GS + '!\x00'; // Normal size font
  p += ESC + 'a\x00'; // Left alignment
  p += `Time: ${new Date().toLocaleString()}\n`;
  p += '------------------------------------------\n';

  // Items List
  for (const item of items) {
    if (item.isSeparator) {
      p += '\n';
      p += ESC + 'a\x01'; // Center
      p += ESC + 'E\x01'; // Bold on
      p += `${item.name}\n`;
      p += ESC + 'E\x00'; // Bold off
      p += ESC + 'a\x00'; // Left
      continue;
    }

    // Print Qty and Name in Bold & Double Height for cooks
    p += ESC + 'E\x01'; // Bold on
    p += GS + '!\x10'; // Double height
    p += `${item.qty} x  ${item.name}\n`;
    p += GS + '!\x00'; // Normal height
    p += ESC + 'E\x00'; // Bold off

    if (item.name2) {
      p += `     (${item.name2})\n`;
    }
    if (item.sizeName && item.sizeName !== 'Regular' && item.sizeName !== 'NoSize') {
      p += `     Size: ${item.sizeName}\n`;
    }
  }

  p += '------------------------------------------\n';
  p += '\n\n\n\n\n';
  p += GS + 'V\x00'; // Full cut (cut the paper)

  return Buffer.from(p, 'binary');
}

/**
 * Send print data to a TCP raw socket port 9100 printer
 */
function sendTcpPrint(ip, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(4000); // 4 seconds timeout

    socket.connect(9100, ip, () => {
      socket.write(data, () => {
        socket.end();
        resolve(true);
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection to printer timed out'));
    });
  });
}

/**
 * Main function to route order items to their respective printers and send print jobs
 */
export async function printOrderDirect(orderInfo, items) {
  // Separate items by target printers
  const sushiItems = [];
  const backKitchenItems = [];

  // If a separator exists, copy it to both lists to keep context, but we will strip empty sections
  items.forEach(item => {
    if (item.isSeparator) {
      sushiItems.push(item);
      backKitchenItems.push(item);
      return;
    }

    // Determine target printer based on item flags
    const isSushi = !!item.kitchenF;
    const isBackKitchen = !!(item.kitchenB || item.kitchenE || item.kitchen5 || item.kitchen6 || item.bar);

    if (isSushi) {
      sushiItems.push(item);
    }
    if (isBackKitchen || (!isSushi && !isBackKitchen)) {
      // Fallback: items with no flags go to back kitchen so they aren't lost
      backKitchenItems.push(item);
    }
  });

  // Helper to filter out consecutive or trailing separators
  const cleanSeparators = (list) => {
    const cleaned = [];
    for (let i = 0; i < list.length; i++) {
      const current = list[i];
      if (current.isSeparator) {
        // Only keep if the NEXT item exists and is NOT a separator
        const next = list[i + 1];
        if (next && !next.isSeparator) {
          cleaned.push(current);
        }
      } else {
        cleaned.push(current);
      }
    }
    return cleaned;
  };

  const finalSushiList = cleanSeparators(sushiItems);
  const finalBackKitchenList = cleanSeparators(backKitchenItems);

  const printPromises = [];

  // Print Sushi Bar Ticket
  if (finalSushiList.length > 0) {
    console.log(`[PRINTER] Formatting Sushi Bar ticket for SalesID: ${orderInfo.salesId}`);
    const data = formatKitchenTicket(
      'Sushi Bar',
      orderInfo.dailyOrderNum,
      orderInfo.tableName,
      orderInfo.takeOut,
      orderInfo.customerName,
      finalSushiList
    );
    printPromises.push(
      sendTcpPrint(PRINTERS.sushiBar, data)
        .then(() => console.log(`[PRINTER] Sushi Bar print SUCCESS`))
        .catch(err => console.error(`[PRINTER] Sushi Bar print FAILED:`, err.message))
    );
  }

  // Print Back Kitchen Ticket
  if (finalBackKitchenList.length > 0) {
    console.log(`[PRINTER] Formatting Back Kitchen ticket for SalesID: ${orderInfo.salesId}`);
    const data = formatKitchenTicket(
      'Back Kitchen',
      orderInfo.dailyOrderNum,
      orderInfo.tableName,
      orderInfo.takeOut,
      orderInfo.customerName,
      finalBackKitchenList
    );
    printPromises.push(
      sendTcpPrint(PRINTERS.backKitchen, data)
        .then(() => console.log(`[PRINTER] Back Kitchen print SUCCESS`))
        .catch(err => console.error(`[PRINTER] Back Kitchen print FAILED:`, err.message))
    );
  }

  // Await printing (but don't reject the parent flow; print errors are caught inside)
  await Promise.all(printPromises);
}
