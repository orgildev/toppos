# TOP_POS_Pro Concurrent Web Application Project

This repository contains a mobile/tablet-friendly web application designed to run concurrently with the existing Windows 7 POS desktop client (`TOP_POS_Pro.exe`). The web app allows table order placement directly from Android/iOS tablets in real-time by communicating directly with the shared POS database.

---

## 1. Technical Architecture & Network Layout

The web application runs on a local server (or a WSL2 environment on the local network) and communicates directly with the Microsoft SQL Server database hosted on the Windows 7 POS computer.

```mermaid
graph TD
    Tablet[Android Tablet Browser] -->|HTTP Requests / Web Socket| WebServer[Next.js Server (Port 3000)]
    WebServer -->|Direct TCP Connection (Port 1433)| Database[(MS SQL Server on Windows 7)]
    POS[TOP_POS_Pro.exe Client] -->|Direct ODBC Connection| Database
```

* **Zero-Modification Rule**: The desktop binary `TOP_POS_Pro.exe` remains untouched. All integration happens concurrently via the shared SQL database tables that the desktop client reads/writes in real time.
* **Host IP Configuration**: The database host IP is fully configurable via the tablet interface. If connection fails, a setup screen allows you to save the new IP address of the Windows 7 host machine into `db_config.json`.

---

## 2. Dependencies & Prerequisites

To install and run the web application, ensure the following dependencies are met:

### System & Environment Requirements
* **Node.js**: Next.js 16 requires **Node.js v18.17.0 or higher** (LTS versions like v20, v22, or v24 are recommended).
* **NPM**: Node Package Manager (comes bundled with Node.js).
* **Network Access**: The server running this application must have TCP routing access to the Windows 7 host machine on port **1433**.

### Application Dependencies
These packages are automatically installed from `webapp/package.json`:
* **`next`** (v16.2.9): React web application framework.
* **`mssql`** (v12.5.5): Node.js client driver for Microsoft SQL Server.
* **`react`** & **`react-dom`** (v19.2.4): Modern frontend rendering engine.
* **`tailwindcss`** & **`@tailwindcss/postcss`** (v4.x): Styling framework.

---

## 3. Installation Guide

### Step 1: Install Node.js & NPM (If not already installed)
On Linux/Ubuntu, install Node.js via NVM (Node Version Manager):
```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# Install Node.js LTS (e.g., v22 or v24)
nvm install 22
```

### Step 2: Install Project Dependencies
Navigate to the `webapp` folder of the cloned repository and install the Node packages:
```bash
cd webapp
npm ci
```
*(Use `npm install` if `package-lock.json` is not present, though `npm ci` is recommended for clean installations).*

### Step 3: Configure Database & Network on the Windows 7 Host
For the Node.js server to talk to the MS SQL Server on the Windows 7 PC:
1. **Enable TCP/IP**: Open *SQL Server Configuration Manager* on the Windows 7 PC. Go to *SQL Server Network Configuration* -> *Protocols for MSSQLSERVER* -> enable **TCP/IP**.
2. **Set Port**: Double-click *TCP/IP*, navigate to the *IP Addresses* tab, scroll to *IPAll*, and verify the **TCP Port** is set to `1433`.
3. **Configure Windows Firewall**: Open Windows Firewall on the Windows 7 PC and add an **Inbound Rule** to allow TCP port `1433` for incoming traffic.
4. **SQL Authentication**: Ensure SQL Server Authentication is enabled with the login credentials:
   * **User ID**: `finalsolution`
   * **Password**: `gmldnjs`
   * **Default Database**: `TPPro`

---

## 4. Startup & Operations Guide

### Step 1: Start the Web App Server
From the root of the project directory, run the startup script:
```bash
chmod +x start_server.sh
./start_server.sh
```
This runs the Next.js development server binding to `0.0.0.0`, making it accessible on the local network.

### Step 2: Open on Android Tablet
1. Connect your tablet/device to the same Wi-Fi network as the server.
2. Open a web browser and go to:
   ```text
   http://<host-ip-shown-in-terminal>:3000
   ```

### Step 3: Enter Database Settings
If the Windows 7 PC is running at an IP other than the default (`192.168.123.100`), a connection error banner will appear. Click **"Configure Host IP Address"**, type in the current IP of your Windows 7 computer, and click **"Save & Connect"**. The configuration is saved locally to `webapp/db_config.json`.

---

## 5. Reverse-Engineering & DB Schema Details

For developers wanting to inspect the integration schema:
* **Table States**: Open occupied tables are tracked via `tblTable` with `Opened = 1` and `OrderNum = @SalesID`.
* **Kitchen Print Queue**: Order queues are written to `tblOrderPrintCue`. The desktop POS client polls this table via `sp_GetOrdersToBePrinted` and triggers the printing process automatically.
* For more information on the Delphi binary structure and table layouts, refer to [project.md](file:///home/orgil/toppos/project.md).
