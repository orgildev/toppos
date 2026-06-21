# TOP_POS_Pro Concurrent Web Application Project

This document outlines the reverse-engineering findings, design layout, database integration schema, and execution details for the mobile/tablet-friendly web application designed to run concurrently with the existing Windows 7 POS client (`TOP_POS_Pro.exe`).

---

## 1. Reverse-Engineering Findings

Through static analysis of the Delphi binary `TOP_POS_Pro.exe` and database SQL files, the following details were discovered:

*   **Application Platform**: 32-bit PE GUI binary compiled with Delphi (indicated by "FastMM Borland Edition", "DelphiZXingQRCode", and Delphi VCL runtime metadata).
*   **Database Engine**: Microsoft SQL Server (ODBC DSN connection `TPCR` / `RestoreDB`).
*   **Hardcoded Credentials**:
    *   **User ID**: `finalsolution`
    *   **Password**: `gmldnjs` (Korean layout typing for "희원")
    *   **Default Database (Catalog)**: `TPPro`
*   **POS GUI Print Queue & Thread**: The executable contains a background polling class `TPickupOnlineOrderFileThread` and uses stored procedures like `sp_GetOrdersToBePrinted` to monitor a print queue table `tblOrderPrintCue`.

---

## 2. Technical Architecture & Network Layout

The web application runs on a local server (or in your local WSL2 environment) and connects directly to the SQL Server database running on the Windows 7 POS computer. 

```mermaid
graph TD
    Tablet[Android Tablet Browser] -->|HTTP Requests / Web Socket| WebServer[Next.js Server (Port 3000)]
    WebServer -->|Direct TCP Connection (Port 1433)| Database[(MS SQL Server on Windows 7)]
    POS[TOP_POS_Pro.exe Client] -->|Direct ODBC Connection| Database
```

*   **Zero-Modification Rule**: We do not touch or patch the desktop binary `TOP_POS_Pro.exe`. Instead, we communicate purely via the shared SQL database tables that the desktop client reads/writes in real time.
*   **Host IP Configuration**: The server IP address is configurable. In case of database connection failures, a setup screen appears on the tablet where you can test and save the IP address of the Windows 7 host machine. It is stored in `db_config.json`.

---

## 3. Database Schema Integration

The web app integrates with the database in two main ways:

### A. Active Ticket Generation (Dine-In / Direct to Table)
To make orders instantly appear as open occupied tables on the POS screen:
1.  **Check Table State**: Check if the table ID exists in `tblTable` and has `Opened = 1` and `OrderNum > 0`.
2.  **Initialize Transaction**: If the table is closed, insert a new transaction row into `tblSales` with `TransType = 1` (Pending) to generate a unique `SalesID` (`scope_identity()`).
3.  **Open Table**: Update `tblTable` to set `Opened = 1` and `OrderNum = @SalesID`.
4.  **Save Lines**: Insert items into `tblPendingOrders` using the `SalesID`.
5.  **Trigger Print**: Insert or update a row in `tblOrderPrintCue` with `PrintedStatus = 0`. The desktop POS client will automatically detect it and print the kitchen tickets.

### B. Menu & Pricing Queries
*   **Categories**: Pulled from `tblCategory` (sorted by `PrintOrder` and `CatName`).
*   **Items**: Pulled from `tblItem` (active items with `Status = 1`).
*   **Pricing & Sizes**: Joined with `tblAvailableSize` (pricing levels) and `tblSize` (size names) to retrieve prices dynamically.

---

## 4. Web Application Folder Structure

The project code is organized as a Next.js (App Router) project located in the [webapp/](file:///home/orgil/toppos/webapp) folder:

*   **Start Script**: [start_server.sh](file:///home/orgil/toppos/start_server.sh) - Helper bash script to boot the server and print the tablet URL.
*   **Dependencies Config**: [package.json](file:///home/orgil/toppos/webapp/package.json) - Contains scripts (`dev-network`, `start-network`) and dependencies (like `mssql` and `next`).
*   **DB Client Connection**: [src/lib/db.js](file:///home/orgil/toppos/webapp/src/lib/db.js) - Manages SQL Server connection pool caching.
*   **UI Frontend Layout**: [src/app/page.js](file:///home/orgil/toppos/webapp/src/app/page.js) - Main touch-first POS console interface.
*   **API Routes**:
    *   [src/app/api/config/route.js](file:///home/orgil/toppos/webapp/src/app/api/config/route.js) - Configures the target SQL server IP.
    *   [src/app/api/menu/route.js](file:///home/orgil/toppos/webapp/src/app/api/menu/route.js) - Fetches menu layout dynamically from the database.
    *   [src/app/api/tables/route.js](file:///home/orgil/toppos/webapp/src/app/api/tables/route.js) - Lists occupied and free restaurant tables.
    *   [src/app/api/orders/route.js](file:///home/orgil/toppos/webapp/src/app/api/orders/route.js) - Places orders and queues printer cues.

---

## 5. Startup & Operations Guide

### Step 1: Start the Web App Server
From the root of your POS directory, execute:
```bash
./start_server.sh
```
This boots the Next.js development server binding to `0.0.0.0`, making it accessible on the local network.

### Step 2: Open on Android Tablet
1.  Connect your Android tablet to the same local Wi-Fi network.
2.  Open Chrome or any web browser and go to:
    ```text
    http://<host-ip-shown-in-terminal>:3000
    ```

### Step 3: Enter Database Settings
On first load, if the Windows 7 PC is not running at the default IP, you will see a connection error banner. Click **"Configure Host IP Address"**, type in the current IP of your Windows 7 computer, and click **"Save & Connect"**. The server will reconnect immediately and load the active menu.
