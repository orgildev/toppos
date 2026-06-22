'use client';

import React, { useState, useEffect, useRef } from 'react';

const CATEGORY_COLORS = [
  'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white',
  'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white',
  'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white',
  'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white',
  'bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white',
  'bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white',
  'bg-fuchsia-600 hover:bg-fuchsia-700 active:bg-fuchsia-800 text-white',
  'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white',
  'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white',
];

export default function POSPage() {
  // State
  const [categories, setCategories] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [selectedCartIndex, setSelectedCartIndex] = useState(null);
  
  const [selectedTable, setSelectedTable] = useState(null);
  const [takeOut, setTakeOut] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  
  // Modals
  const [showTableModal, setShowTableModal] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [sizeModalItem, setSizeModalItem] = useState(null);

  // DB Config State
  const [serverIp, setServerIp] = useState('');
  const [dbName, setDbName] = useState('TPPro');
  const [dbError, setDbError] = useState(null);
  
  // Loading & Submitting
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);

  const cartListRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    fetchConfig();
    fetchMenuAndTables();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.server) {
        setServerIp(data.server);
        setDbName(data.database);
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  };

  const fetchMenuAndTables = async () => {
    setLoading(true);
    setDbError(null);
    try {
      // Fetch menu
      const menuRes = await fetch('/api/menu');
      const menuData = await menuRes.json();
      
      if (!menuRes.ok || !menuData.success) {
        throw new Error(menuData.message || 'Database connection error.');
      }
      
      setCategories(menuData.categories);
      if (menuData.categories.length > 0) {
        setSelectedCategory(menuData.categories[0]);
      }

      // Fetch tables
      const tablesRes = await fetch('/api/tables');
      const tablesData = await tablesRes.json();
      if (tablesRes.ok && tablesData.success) {
        setTables(tablesData.tables);
      }
    } catch (err) {
      setDbError(err.message || 'Failed to connect to the POS database.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server: serverIp, database: dbName })
      });
      const data = await res.json();
      if (data.success) {
        setShowConfigModal(false);
        // Retry connection
        await fetchMenuAndTables();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Error saving configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Cart operations
  const handleAddItem = (item) => {
    if (item.sizes && item.sizes.length > 1) {
      // Pop up size selector
      setSizeModalItem(item);
      setShowSizeModal(true);
    } else {
      const size = item.sizes[0] || { sizeId: 1, sizeName: 'Regular', price: 0 };
      addToCart(item, size);
    }
  };

  const addToCart = (item, size) => {
    // Check if item of same ID and size exists in cart
    const existingIndex = cart.findIndex(
      (c) => c.itemId === item.id && c.sizeId === size.sizeId
    );

    if (existingIndex > -1) {
      const newCart = [...cart];
      newCart[existingIndex].qty += 1;
      setCart(newCart);
      setSelectedCartIndex(existingIndex);
    } else {
      const newCart = [
        ...cart,
        {
          itemId: item.id,
          name: item.name,
          name2: item.name2,
          sizeId: size.sizeId,
          sizeName: size.sizeName,
          price: size.price,
          qty: 1,
          categoryName: selectedCategory.name
        }
      ];
      setCart(newCart);
      setSelectedCartIndex(newCart.length - 1);
      
      // Scroll to bottom of cart list
      setTimeout(() => {
        if (cartListRef.current) {
          cartListRef.current.scrollTop = cartListRef.current.scrollHeight;
        }
      }, 50);
    }
  };

  const handleAdjustQty = (amount) => {
    if (selectedCartIndex === null) return;
    const newCart = [...cart];
    const item = newCart[selectedCartIndex];
    item.qty += amount;
    if (item.qty <= 0) {
      // Remove
      newCart.splice(selectedCartIndex, 1);
      setSelectedCartIndex(newCart.length > 0 ? newCart.length - 1 : null);
    }
    setCart(newCart);
  };

  const handleVoidItem = () => {
    if (selectedCartIndex === null) return;
    const newCart = [...cart];
    newCart.splice(selectedCartIndex, 1);
    setCart(newCart);
    setSelectedCartIndex(newCart.length > 0 ? newCart.length - 1 : null);
  };

  const handleClearAll = () => {
    if (cart.length === 0) return;
    if (confirm('Clear entire order ticket?')) {
      setCart([]);
      setSelectedCartIndex(null);
    }
  };

  // Calculations
  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  };

  const getGST = () => {
    return getSubtotal() * 0.05; // 5% GST
  };

  const getPST = () => {
    return getSubtotal() * 0.07; // 7% PST
  };

  const getTotal = () => {
    return getSubtotal() + getGST() + getPST();
  };

  const handleSelectTable = (table) => {
    setSelectedTable(table);
    setTakeOut(false);
    setShowTableModal(false);
  };

  const handleSelectTakeout = () => {
    setSelectedTable(null);
    setTakeOut(true);
    setShowTableModal(false);
    setShowCustomerModal(true);
  };

  // Submit Order to Database
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      alert('Cannot send empty ticket.');
      return;
    }
    if (!selectedTable && !takeOut) {
      alert('Please assign a Table or select Takeout first.');
      setShowTableModal(true);
      return;
    }

    setSubmitting(true);
    setSubmitMessage('Sending order to database...');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: selectedTable ? selectedTable.id : 0,
          takeOut: takeOut,
          items: cart,
          customer: takeOut ? { name: customerName, phone: customerPhone } : null
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitMessage('Order sent! Kitchen tickets queued.');
        setCart([]);
        setSelectedCartIndex(null);
        setSelectedTable(null);
        setTakeOut(false);
        setCustomerName('');
        setCustomerPhone('');
        
        // Refresh tables layout
        const tablesRes = await fetch('/api/tables');
        const tablesData = await tablesRes.json();
        if (tablesRes.ok && tablesData.success) {
          setTables(tablesData.tables);
        }

        setTimeout(() => {
          setSubmitMessage(null);
        }, 3000);
      } else {
        alert(data.message || 'Error submitting order.');
        setSubmitMessage(null);
      }
    } catch (err) {
      alert('Network error connecting to backend API.');
      setSubmitMessage(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Database Connection Error Screen
  if (dbError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-6 font-sans">
        <div className="bg-slate-800 border-2 border-red-600 rounded-lg p-8 max-w-lg w-full text-center shadow-xl">
          <div className="text-red-500 text-6xl mb-4 font-bold">⚠️</div>
          <h1 className="text-2xl font-bold mb-2">POS Database Connection Failed</h1>
          <p className="text-slate-400 mb-6">
            Unable to connect to the MS SQL Server on the Windows 7 POS computer.
          </p>
          <div className="bg-slate-950 text-left p-4 rounded mb-6 text-sm font-mono overflow-auto max-h-32 border border-slate-700">
            <span className="text-red-400">Target IP:</span> {serverIp || 'Not configured'}<br/>
            <span className="text-red-400">Error:</span> {dbError}
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setShowConfigModal(true)}
              className="bg-blue-600 text-white font-bold py-3 px-6 rounded-lg active:bg-blue-700 text-lg"
            >
              Configure Host IP Address
            </button>
            <button
              onClick={fetchMenuAndTables}
              className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-6 rounded-lg active:bg-slate-800"
            >
              Retry Connection
            </button>
          </div>
        </div>

        {/* Configuration Modal */}
        {showConfigModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 p-4">
            <form onSubmit={handleSaveConfig} className="bg-slate-800 border-2 border-slate-600 rounded-lg p-6 max-w-sm w-full shadow-2xl">
              <h2 className="text-xl font-bold mb-4 text-center">Connection Setup</h2>
              <div className="mb-4">
                <label className="block text-slate-300 text-sm font-bold mb-2">Windows 7 POS PC IP Address:</label>
                <input
                  type="text"
                  value={serverIp}
                  onChange={(e) => setServerIp(e.target.value)}
                  placeholder="e.g. 192.168.123.100"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded py-3 px-4 text-white text-lg font-mono text-center focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="mb-6">
                <label className="block text-slate-300 text-sm font-bold mb-2">Database Name:</label>
                <input
                  type="text"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded py-3 px-4 text-white text-lg font-mono text-center focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="w-1/2 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-blue-600 text-white font-bold py-3 px-4 rounded active:bg-blue-700"
                >
                  Save & Connect
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // General Loading Screen
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-slate-400">Loading POS Menu and Tables...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-row w-screen h-screen overflow-hidden bg-slate-950 text-white font-sans select-none">
      
      {/* LEFT COLUMN: ACTIVE TICKET AREA (35% Width) */}
      <div className="flex flex-col w-[35%] h-full border-r-2 border-slate-800 bg-slate-900">
        
        {/* Ticket Header */}
        <div className="flex items-center justify-between p-3 border-b-2 border-slate-800 bg-slate-950">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">ASSIGNED TO:</span>
            <span className="text-lg font-black tracking-wide">
              {takeOut ? 'TAKEOUT ORDER' : selectedTable ? `TABLE: ${selectedTable.name}` : 'UNASSIGNED'}
            </span>
          </div>
          <button
            onClick={() => setShowTableModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-3 rounded active:bg-blue-700 text-sm tracking-wider shadow-md"
          >
            TABLE / TO
          </button>
        </div>

        {/* Ticket Items List */}
        <div 
          ref={cartListRef}
          className="flex-grow overflow-y-auto"
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-xs font-bold uppercase border-b border-slate-800">
                <th className="py-2 px-3 w-12 text-center">Qty</th>
                <th className="py-2 px-2">Item</th>
                <th className="py-2 px-2 w-16 text-right">Price</th>
                <th className="py-2 px-3 w-20 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-12 text-center text-slate-500 font-medium">
                    Empty Ticket<br/>
                    <span className="text-xs text-slate-600">Select items on the right grid</span>
                  </td>
                </tr>
              ) : (
                cart.map((item, index) => (
                  <tr
                    key={index}
                    onClick={() => setSelectedCartIndex(index)}
                    className={`border-b border-slate-850 cursor-pointer text-md font-bold transition-all ${
                      selectedCartIndex === index 
                        ? 'bg-blue-900/60 text-white border-l-4 border-l-blue-500' 
                        : 'text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-3 text-center text-blue-400">{item.qty}</td>
                    <td className="py-3 px-2">
                      <div>{item.name}</div>
                      {item.name2 && <div className="text-xs text-slate-400 font-normal">{item.name2}</div>}
                      {item.sizeName && item.sizeName !== 'Regular' && (
                        <span className="text-xs bg-slate-800 text-slate-300 font-medium px-1.5 py-0.5 rounded ml-1">
                          {item.sizeName}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right text-slate-300">${item.price.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right">${(item.price * item.qty).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Ticket Tactile Adjust Controls */}
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-950 border-t border-slate-850">
          <button
            onClick={() => handleAdjustQty(1)}
            disabled={selectedCartIndex === null}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 text-xl rounded active:bg-slate-900 disabled:opacity-40"
          >
            + Qty
          </button>
          <button
            onClick={() => handleAdjustQty(-1)}
            disabled={selectedCartIndex === null}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 text-xl rounded active:bg-slate-900 disabled:opacity-40"
          >
            - Qty
          </button>
          <button
            onClick={handleVoidItem}
            disabled={selectedCartIndex === null}
            className="bg-red-950/80 hover:bg-red-900 text-red-300 font-bold py-4 text-md rounded active:bg-red-950 disabled:opacity-40 border border-red-900"
          >
            VOID
          </button>
        </div>

        {/* Ticket Summary */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-sm space-y-1 font-semibold">
          <div className="flex justify-between text-slate-400">
            <span>Subtotal:</span>
            <span>${getSubtotal().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>GST (5%):</span>
            <span>${getGST().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>PST (7%):</span>
            <span>${getPST().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-white text-2xl font-black pt-1 border-t border-slate-850">
            <span>TOTAL:</span>
            <span className="text-emerald-400">${getTotal().toFixed(2)}</span>
          </div>
        </div>

        {/* Send & Checkout Action Buttons */}
        <div className="grid grid-cols-2 gap-2 p-2 border-t-2 border-slate-800 bg-slate-950">
          <button
            onClick={handleClearAll}
            disabled={cart.length === 0}
            className="bg-slate-900 border-2 border-red-700 hover:bg-red-950/50 text-red-400 font-black py-5 text-lg uppercase tracking-widest rounded active:bg-red-950 disabled:opacity-40"
          >
            Clear
          </button>
          <button
            onClick={handleSubmitOrder}
            disabled={cart.length === 0}
            className="bg-emerald-600 text-white font-black py-5 text-lg uppercase tracking-widest rounded active:bg-emerald-700 disabled:opacity-40 shadow-lg hover:bg-emerald-500"
          >
            Send (Print)
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: CATEGORY & ITEM GRID (65% Width) */}
      <div className="flex flex-col w-[65%] h-full bg-slate-950">
        
        {/* Category Tab Row (Touch Scrollable) */}
        <div className="flex flex-row overflow-x-auto p-2 border-b-2 border-slate-900 gap-1.5 scrollbar-thin bg-slate-950 shrink-0">
          {categories.map((cat, idx) => {
            const isSelected = selectedCategory && selectedCategory.id === cat.id;
            const colorClass = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat)}
                className={`px-6 py-4 text-md font-bold uppercase tracking-wider rounded shrink-0 transition-all shadow-md ${
                  isSelected 
                    ? `${colorClass} ring-4 ring-white` 
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-300 active:bg-slate-900 border border-slate-700'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* Item Button Grid */}
        <div className="flex-grow overflow-y-auto p-3">
          {selectedCategory && (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {selectedCategory.items.map((item) => {
                const priceLabel = item.sizes.length > 1 
                  ? 'Multi' 
                  : item.sizes[0] 
                    ? `$${item.sizes[0].price.toFixed(2)}` 
                    : '$0.00';

                return (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    className="flex flex-col items-center justify-between p-4 h-24 bg-slate-800 hover:bg-slate-750 active:bg-slate-900 rounded border border-slate-700 shadow-md text-center transition-all"
                  >
                    <div className="flex flex-col items-center justify-center flex-grow">
                      <span className="text-md font-black uppercase text-white leading-tight">{item.name}</span>
                      {item.name2 && <span className="text-xs font-semibold text-slate-400 leading-tight mt-0.5">{item.name2}</span>}
                    </div>
                    <span className="text-sm font-bold text-emerald-400 mt-1">{priceLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Small POS Footer */}
        <div className="flex justify-between items-center px-4 py-2 border-t border-slate-900 bg-slate-950 text-xs text-slate-500 font-semibold uppercase tracking-wider shrink-0">
          <span>Server Terminal Mode</span>
          <button 
            onClick={() => setShowConfigModal(true)} 
            className="hover:text-white transition-colors"
          >
            DB IP: {serverIp} | settings
          </button>
        </div>
      </div>

      {/* TABLE SELECTION MODAL */}
      {showTableModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-xl font-bold tracking-wide">Select Table or Order Mode</h2>
              <button
                onClick={() => setShowTableModal(false)}
                className="text-slate-400 hover:text-white font-bold text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="mb-4 flex gap-2 shrink-0">
              <button
                onClick={handleSelectTakeout}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-4 rounded text-lg uppercase active:bg-orange-700 shadow-lg"
              >
                Takeout / Quick Order
              </button>
            </div>

            <div className="border-t border-slate-800 my-2 shrink-0"></div>
            <h3 className="text-sm text-slate-400 font-bold uppercase mb-2 shrink-0">Restaurant Floor Tables:</h3>
            
            <div className="flex-grow overflow-y-auto grid grid-cols-4 gap-2 pr-1">
              {tables.map((table) => {
                const colorClass = table.opened 
                  ? 'bg-red-900/60 border-2 border-red-600 hover:bg-red-950 text-red-100' 
                  : 'bg-slate-800 border border-slate-700 hover:bg-slate-750 text-slate-200';
                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={`py-5 rounded text-md font-black uppercase text-center transition-all active:scale-95 ${colorClass}`}
                  >
                    {table.name}
                    {table.opened && <div className="text-[10px] text-red-400 font-bold mt-0.5">OPEN TICKET</div>}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setShowTableModal(false)}
              className="mt-6 w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded shrink-0"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MULTIPLE SIZES MODAL */}
      {showSizeModal && sizeModalItem && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 max-w-sm w-full shadow-2xl text-center">
            <h2 className="text-lg font-bold mb-1 uppercase tracking-wide">Select Item Size</h2>
            <p className="text-sm text-slate-400 mb-4 font-semibold">{sizeModalItem.name}</p>
            
            <div className="flex flex-col gap-2">
              {sizeModalItem.sizes.map((size) => (
                <button
                  key={size.sizeId}
                  onClick={() => {
                    addToCart(sizeModalItem, size);
                    setShowSizeModal(false);
                    setSizeModalItem(null);
                  }}
                  className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white font-black py-4 rounded text-md uppercase active:bg-slate-900 flex justify-between px-6 items-center transition-all"
                >
                  <span>{size.sizeName}</span>
                  <span className="text-emerald-400">${size.price.toFixed(2)}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setShowSizeModal(false);
                setSizeModalItem(null);
              }}
              className="mt-6 w-full bg-slate-950 border border-slate-800 text-slate-400 font-semibold py-3 rounded active:bg-slate-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* CUSTOMER INFO POPUP FOR TAKEOUT */}
      {showCustomerModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-center tracking-wide uppercase">Takeout Details</h2>
            <div className="mb-4">
              <label className="block text-slate-300 text-sm font-bold mb-1">Customer Name:</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full bg-slate-950 border border-slate-700 rounded py-2.5 px-3 text-white text-md focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="mb-6">
              <label className="block text-slate-300 text-sm font-bold mb-1">Phone Number (Optional):</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 555-0199"
                className="w-full bg-slate-950 border border-slate-700 rounded py-2.5 px-3 text-white text-md focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setTakeOut(false);
                  setShowCustomerModal(false);
                }}
                className="w-1/2 bg-slate-950 border border-slate-800 text-slate-400 font-semibold py-3 rounded active:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowCustomerModal(false)}
                className="w-1/2 bg-orange-600 text-white font-bold py-3 rounded active:bg-orange-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showConfigModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 p-4">
          <form onSubmit={handleSaveConfig} className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-center tracking-wide">POS Connection Setup</h2>
            <div className="mb-4">
              <label className="block text-slate-300 text-sm font-bold mb-2">Windows 7 PC Local IP Address:</label>
              <input
                type="text"
                value={serverIp}
                onChange={(e) => setServerIp(e.target.value)}
                placeholder="e.g. 192.168.123.100"
                required
                className="w-full bg-slate-950 border border-slate-700 rounded py-3 px-4 text-white text-lg font-mono text-center focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="mb-6">
              <label className="block text-slate-300 text-sm font-bold mb-2">Database Name:</label>
              <input
                type="text"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded py-3 px-4 text-white text-lg font-mono text-center focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="w-1/2 bg-slate-950 border border-slate-800 text-slate-400 font-semibold py-3 px-4 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 bg-blue-600 text-white font-bold py-3 px-4 rounded active:bg-blue-700 shadow-md"
              >
                Save & Connect
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBMISSION BLOCKER SCREEN */}
      {submitting && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/80 z-[100] text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
          <p className="text-xl font-bold tracking-wide">{submitMessage}</p>
        </div>
      )}

      {/* TEMPORARY SUBMIT STATUS POPUP */}
      {submitMessage && !submitting && (
        <div className="fixed bottom-10 left-10 bg-emerald-600 text-white font-black py-4 px-8 text-lg rounded shadow-2xl z-[100] border-2 border-white animate-bounce">
          {submitMessage}
        </div>
      )}
    </div>
  );
}
