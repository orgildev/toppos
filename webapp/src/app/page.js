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
  const [activeOrderItems, setActiveOrderItems] = useState([]);
  
  const [selectedTable, setSelectedTable] = useState(null);
  const [takeOut, setTakeOut] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  
  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  
  // Modals
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [sizeModalItem, setSizeModalItem] = useState(null);

  // DB Config State
  const [serverIp, setServerIp] = useState('');
  const [dbName, setDbName] = useState('TPPro');
  const [dbPort, setDbPort] = useState('2345');
  const [dbUser, setDbUser] = useState('finalsolution');
  const [dbPassword, setDbPassword] = useState('gmldnjs');
  const [dbError, setDbError] = useState(null);
  
  // Loading & Submitting
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);

  const cartListRef = useRef(null);
  const touchStartRef = useRef({ index: null });

  // Fetch initial data
  useEffect(() => {
    fetchConfig();
    fetchMenuAndTables();
  }, []);

  // Real-time synchronization polling every 3 seconds
  useEffect(() => {
    if (loading || dbError) return;

    const interval = setInterval(() => {
      // 1. Fetch tables list
      fetch('/api/tables')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.tables) {
            setTables(prev => {
              if (JSON.stringify(prev) !== JSON.stringify(data.tables)) {
                return data.tables;
              }
              return prev;
            });
            
            // If a table is currently selected, keep its table reference in sync
            if (selectedTable) {
              const updatedTable = data.tables.find(t => t.id === selectedTable.id);
              if (updatedTable && (updatedTable.opened !== selectedTable.opened || updatedTable.orderNum !== selectedTable.orderNum)) {
                setSelectedTable(updatedTable);
              }
            }
          }
        })
        .catch(err => console.error('Error polling tables:', err));

      // 2. Fetch active order items for selected table
      if (selectedTable) {
        fetchActiveOrderItems(selectedTable.id);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [loading, dbError, selectedTable]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.server) {
        setServerIp(data.server);
        setDbName(data.database);
        if (data.port) setDbPort(data.port.toString());
        if (data.user) setDbUser(data.user);
        if (data.password) setDbPassword(data.password);
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
        body: JSON.stringify({
          server: serverIp,
          database: dbName,
          port: parseInt(dbPort) || 2345,
          user: dbUser,
          password: dbPassword
        })
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
    if (!selectedTable && !takeOut) {
      alert('Please select a table or takeout first.');
      setSelectedTable(null);
      setTakeOut(false);
      return;
    }
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
    setCart([]);
    setSelectedCartIndex(null);
  };

  const handleAddPersonSeparator = () => {
    // Determine the next person number based on existing separators
    let maxPerson = 0;
    cart.forEach(item => {
      if (item.isSeparator) {
        const match = item.name.match(/Person\s+(\d+)/i);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxPerson) maxPerson = num;
        }
      }
    });
    const nextPersonNum = maxPerson + 1;
    const separatorName = `--- Person ${nextPersonNum} ---`;

    const newCart = [
      ...cart,
      {
        itemId: 1, // Open Food Item ID
        name: separatorName,
        name2: '',
        sizeId: 1,
        sizeName: 'Regular',
        price: 0,
        qty: 1,
        isSeparator: true,
        categoryName: 'Separator'
      }
    ];

    setCart(newCart);
    setSelectedCartIndex(newCart.length - 1);
    
    setTimeout(() => {
      if (cartListRef.current) {
        cartListRef.current.scrollTop = cartListRef.current.scrollHeight;
      }
    }, 50);
  };

  // Mouse and Touch Drag and Drop handlers for cart reordering / moving between persons
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newCart = [...cart];
    const draggedItem = newCart[draggedIndex];
    
    // Remove from old position and insert at target position
    newCart.splice(draggedIndex, 1);
    newCart.splice(targetIndex, 0, draggedItem);

    setCart(newCart);
    setSelectedCartIndex(targetIndex);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Touch drag-and-drop handlers (for tablets/mobile POS)
  const handleTouchStart = (e, index) => {
    setDraggedIndex(index);
    touchStartRef.current = { index };
  };

  const handleTouchMove = (e) => {
    if (draggedIndex === null) return;
    
    // Prevent default body scrolling while dragging an item
    if (e.cancelable) {
      e.preventDefault();
    }
    
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;
    
    const tr = element.closest('tr');
    if (!tr) return;
    
    const targetIndexStr = tr.getAttribute('data-index');
    if (targetIndexStr !== null) {
      const targetIndex = parseInt(targetIndexStr, 10);
      if (targetIndex !== draggedIndex) {
        setDragOverIndex(targetIndex);
      } else {
        setDragOverIndex(null);
      }
    }
  };

  const handleTouchEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newCart = [...cart];
      const draggedItem = newCart[draggedIndex];
      
      newCart.splice(draggedIndex, 1);
      newCart.splice(dragOverIndex, 0, draggedItem);
      
      setCart(newCart);
      setSelectedCartIndex(dragOverIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
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

  const getActiveSubtotal = () => {
    return activeOrderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  };

  const getActiveTotal = () => {
    const sub = getActiveSubtotal();
    return sub + (sub * 0.05) + (sub * 0.07);
  };

  const fetchActiveOrderItems = async (tableId) => {
    if (!tableId) {
      setActiveOrderItems([]);
      return;
    }
    try {
      const res = await fetch(`/api/orders?tableId=${tableId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        const newItems = data.items || [];
        setActiveOrderItems(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newItems)) {
            return newItems;
          }
          return prev;
        });
      } else {
        setActiveOrderItems([]);
      }
    } catch (err) {
      console.error('Error fetching active table orders:', err);
      setActiveOrderItems([]);
    }
  };

  const handleSelectTable = (table) => {
    setSelectedTable(table);
    setTakeOut(false);
    fetchActiveOrderItems(table.id);
  };

  const handleSelectTakeout = () => {
    setSelectedTable(null);
    setTakeOut(true);
    setShowCustomerModal(true);
    setActiveOrderItems([]);
  };

  // Submit Order to Database
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      alert('Cannot send empty ticket.');
      return;
    }
    if (!selectedTable && !takeOut) {
      alert('Please assign a Table or select Takeout first.');
      setSelectedTable(null);
      setTakeOut(false);
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
        setActiveOrderItems([]);
        
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

  const handleBackToTables = () => {
    if (cart.length > 0) {
      if (!confirm('You have unsaved items in your cart. Go back and discard them?')) {
        return;
      }
    }
    setSelectedTable(null);
    setTakeOut(false);
    setCart([]);
    setSelectedCartIndex(null);
  };

  const renderConfigModal = () => (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 p-4 overflow-y-auto">
      <form onSubmit={handleSaveConfig} className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 max-w-sm w-full shadow-2xl my-8">
        <h2 className="text-xl font-bold mb-4 text-center tracking-wide">POS Connection Setup</h2>
        <div className="mb-3">
          <label className="block text-slate-300 text-xs font-bold mb-1">Windows 7 PC Local IP Address:</label>
          <input
            type="text"
            value={serverIp}
            onChange={(e) => setServerIp(e.target.value)}
            placeholder="e.g. 192.168.123.100"
            required
            className="w-full bg-slate-950 border border-slate-700 rounded py-2 px-3 text-white text-md font-mono text-center focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="mb-3">
          <label className="block text-slate-300 text-xs font-bold mb-1">SQL Port:</label>
          <input
            type="text"
            value={dbPort}
            onChange={(e) => setDbPort(e.target.value)}
            placeholder="2345"
            required
            className="w-full bg-slate-950 border border-slate-700 rounded py-2 px-3 text-white text-md font-mono text-center focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="mb-3">
          <label className="block text-slate-300 text-xs font-bold mb-1">Database Name:</label>
          <input
            type="text"
            value={dbName}
            onChange={(e) => setDbName(e.target.value)}
            required
            className="w-full bg-slate-950 border border-slate-700 rounded py-2 px-3 text-white text-md font-mono text-center focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="mb-3">
          <label className="block text-slate-300 text-xs font-bold mb-1">Database User:</label>
          <input
            type="text"
            value={dbUser}
            onChange={(e) => setDbUser(e.target.value)}
            required
            className="w-full bg-slate-950 border border-slate-700 rounded py-2 px-3 text-white text-md font-mono text-center focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="mb-4">
          <label className="block text-slate-300 text-xs font-bold mb-1">Database Password:</label>
          <input
            type="password"
            value={dbPassword}
            onChange={(e) => setDbPassword(e.target.value)}
            required
            className="w-full bg-slate-950 border border-slate-700 rounded py-2 px-3 text-white text-md font-mono text-center focus:outline-none focus:border-blue-500"
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
  );

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
        {showConfigModal && renderConfigModal()}
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

  if (!selectedTable && !takeOut) {
    return (
      <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-950 text-white font-sans select-none animate-fade-in">
        {/* Beautiful Header */}
        <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              ZEN SUSHI & CM CHICKEN
            </span>
            <span className="text-xs font-bold uppercase px-2.5 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-900">
              Table Layout
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded border border-slate-800">
              DB IP: {serverIp || 'Not Configured'}
            </span>
            <button
              onClick={fetchMenuAndTables}
              className="bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white font-bold px-4 py-2.5 rounded text-sm transition-all border border-slate-700 cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              🔄 Refresh
            </button>
            <button
              onClick={() => setShowConfigModal(true)}
              className="bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white font-bold px-4 py-2.5 rounded text-sm transition-all border border-slate-700 cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              ⚙️ Settings
            </button>
          </div>
        </header>

        {/* Content Container */}
        <main className="flex-grow overflow-y-auto p-6 md:p-8 max-w-7xl mx-auto w-full flex flex-col justify-start gap-8">
          
          {/* Quick Action Button for Takeout */}
          <div className="shrink-0">
            <button
              onClick={handleSelectTakeout}
              className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black py-6 px-8 rounded-xl text-xl uppercase tracking-wider active:scale-[0.99] transition-all shadow-xl hover:shadow-orange-950/20 border border-orange-500/30 flex items-center justify-center gap-3 cursor-pointer"
            >
              🛍️ Takeout / Quick Order
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h2 className="text-lg font-black uppercase tracking-wider text-slate-400">
                Restaurant Floor Tables
              </h2>
              <div className="flex gap-4 text-xs font-semibold uppercase">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700"></span>
                  Vacant ({tables.filter(t => !t.opened).length})
                </span>
                <span className="flex items-center gap-1.5 text-red-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse animate-duration-1000"></span>
                  Occupied ({tables.filter(t => t.opened).length})
                </span>
              </div>
            </div>

            <div className="relative w-full aspect-[1000/630] bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 overflow-hidden shadow-inner">
              {/* Floor layout grid pattern background */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(255,255,255,0))] pointer-events-none"></div>
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:30px_30px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"></div>
              
              {tables.map((table) => {
                const colorClass = table.opened 
                  ? 'bg-gradient-to-b from-red-950 to-red-900 border-red-700/80 hover:from-red-900 hover:to-red-800 text-red-100 shadow-lg shadow-red-950/30' 
                  : 'bg-gradient-to-b from-slate-900/90 to-slate-950/90 border-slate-800/60 hover:from-slate-850 hover:to-slate-900 text-slate-300 hover:border-slate-700 hover:text-white';
                
                const cleanName = table.caption ? table.caption.replace(/Table\s*#?/i, '') : table.name;
                
                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    style={{
                      left: `${(table.alignLeft / 1000) * 100}%`,
                      top: `${(table.alignTop / 630) * 100}%`,
                      width: `${(table.width / 1000) * 100}%`,
                      height: `${(table.height / 630) * 100}%`,
                    }}
                    className={`absolute rounded-xl border font-black uppercase text-center transition-all duration-200 active:scale-95 flex flex-col justify-center items-center overflow-hidden group cursor-pointer shadow-md select-none ${colorClass}`}
                  >
                    <span className="text-xs sm:text-sm md:text-base lg:text-lg tracking-wider font-extrabold group-hover:scale-105 transition-transform duration-200">
                      {cleanName}
                    </span>
                    {table.opened && (
                      <span className="absolute bottom-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse border border-red-400"></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-3 bg-slate-900 border-t border-slate-800 text-center text-xs text-slate-500 font-semibold uppercase tracking-wider shrink-0">
          <span>Server Terminal Mode | Double check all prints</span>
        </footer>

        {/* Render Settings/Config Modal inside Dashboard if open */}
        {showConfigModal && renderConfigModal()}
      </div>
    );
  }

  return (
    <div className="flex flex-row w-screen h-screen overflow-hidden bg-slate-950 text-white font-sans select-none animate-fade-in">
      
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
            onClick={handleBackToTables}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-3 rounded active:bg-slate-950 text-sm tracking-wider shadow-md border border-slate-700 transition-all cursor-pointer"
          >
            ← BACK
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
              {activeOrderItems.length === 0 && cart.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-12 text-center text-slate-500 font-medium">
                    Empty Ticket<br/>
                    <span className="text-xs text-slate-600">Select items on the right grid</span>
                  </td>
                </tr>
              ) : (
                <>
                  {/* Already Ordered items */}
                  {activeOrderItems.map((item, index) => {
                    const isSep = (item.name || '').startsWith('--- Person ');
                    if (isSep) {
                      return (
                        <tr
                          key={`active-${index}`}
                          className="border-b border-slate-850/60 bg-slate-950/20 text-slate-400 text-sm font-bold opacity-75"
                        >
                          <td colSpan="4" className="py-2.5 px-4 text-center font-black tracking-widest text-emerald-500/80 text-sm bg-slate-950/40">
                            {item.name}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr
                        key={`active-${index}`}
                        className="border-b border-slate-850/60 bg-slate-950/20 text-slate-400 text-sm font-semibold opacity-75"
                      >
                        <td className="py-2.5 px-3 text-center text-slate-500">{item.qty}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-900/60 px-1 py-0.5 rounded uppercase tracking-wider">
                              Ordered
                            </span>
                            <span className="text-slate-300">{item.name}</span>
                          </div>
                          {item.name2 && <div className="text-xs text-slate-500 font-normal ml-[62px]">{item.name2}</div>}
                          {item.sizeName && item.sizeName !== 'Regular' && (
                            <span className="text-xs bg-slate-800 text-slate-400 font-medium px-1.5 py-0.5 rounded ml-[62px]">
                              {item.sizeName}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-400">${item.price.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">${(item.price * item.qty).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                  {/* New cart items */}
                  {cart.map((item, index) => {
                    if (item.isSeparator) {
                      return (
                        <tr
                          key={`cart-${index}`}
                          data-index={index}
                          onClick={() => setSelectedCartIndex(index)}
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          onTouchStart={(e) => handleTouchStart(e, index)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          className={`border-b border-slate-850 cursor-grab active:cursor-grabbing transition-all ${
                            selectedCartIndex === index 
                              ? 'bg-indigo-900/60 border-l-4 border-l-indigo-500' 
                              : 'bg-slate-900/40 hover:bg-slate-800/20 text-slate-300'
                          } ${
                            draggedIndex === index ? 'opacity-30 border-2 border-dashed border-indigo-500' : ''
                          } ${
                            dragOverIndex === index ? 'border-t-4 border-t-indigo-500' : ''
                          }`}
                        >
                          <td colSpan="4" className="py-3 px-4 text-center font-black tracking-widest text-indigo-400 text-sm">
                            {item.name}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr
                        key={`cart-${index}`}
                        data-index={index}
                        onClick={() => setSelectedCartIndex(index)}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(e) => handleTouchStart(e, index)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className={`border-b border-slate-850 cursor-grab active:cursor-grabbing text-md font-bold transition-all ${
                          selectedCartIndex === index 
                            ? 'bg-blue-900/60 text-white border-l-4 border-l-blue-500' 
                            : 'text-slate-200 hover:bg-slate-800/40'
                        } ${
                          draggedIndex === index ? 'opacity-30 border-2 border-dashed border-blue-500' : ''
                        } ${
                          dragOverIndex === index ? 'border-t-4 border-t-blue-500' : ''
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
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Ticket Tactile Adjust Controls */}
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-950 border-t border-slate-850">
          <button
            onClick={() => handleAdjustQty(1)}
            disabled={selectedCartIndex === null || cart[selectedCartIndex]?.isSeparator}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 text-xl rounded active:bg-slate-900 disabled:opacity-40 cursor-pointer"
          >
            + Qty
          </button>
          <button
            onClick={() => handleAdjustQty(-1)}
            disabled={selectedCartIndex === null || cart[selectedCartIndex]?.isSeparator}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 text-xl rounded active:bg-slate-900 disabled:opacity-40 cursor-pointer"
          >
            - Qty
          </button>
          <button
            onClick={handleVoidItem}
            disabled={selectedCartIndex === null}
            className="bg-red-950/80 hover:bg-red-900 text-red-300 font-bold py-4 text-md rounded active:bg-red-950 disabled:opacity-40 border border-red-900 cursor-pointer"
          >
            VOID
          </button>
        </div>

        {/* Add Person Separator Button */}
        <div className="p-2 bg-slate-950 border-t border-slate-850">
          <button
            onClick={handleAddPersonSeparator}
            className="w-full bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white font-bold py-4 rounded active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer text-md uppercase tracking-wider"
          >
            👤 Add Person Separator
          </button>
        </div>

        {/* Ticket Summary */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-sm space-y-1 font-semibold">
          {activeOrderItems.length > 0 && (
            <div className="flex justify-between text-emerald-500/80 pb-1 border-b border-slate-850/40">
              <span>Already Ordered:</span>
              <span>${getActiveTotal().toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-400">
            <span>{activeOrderItems.length > 0 ? "New Subtotal:" : "Subtotal:"}</span>
            <span>${getSubtotal().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>{activeOrderItems.length > 0 ? "New GST (5%):" : "GST (5%):"}</span>
            <span>${getGST().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>{activeOrderItems.length > 0 ? "New PST (7%):" : "PST (7%):"}</span>
            <span>${getPST().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-white text-2xl font-black pt-1 border-t border-slate-850">
            <span>TOTAL:</span>
            <span className="text-emerald-400">
              ${(getTotal() + (activeOrderItems.length > 0 ? getActiveTotal() : 0)).toFixed(2)}
            </span>
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
              {selectedCategory.items.map((item, index) => {
                const showSeparator = item.isOption && (index === 0 || !selectedCategory.items[index - 1].isOption);

                const priceLabel = item.sizes.length > 1 
                  ? 'Multi' 
                  : item.sizes[0] 
                    ? `$${item.sizes[0].price.toFixed(2)}` 
                    : '$0.00';

                return (
                  <React.Fragment key={item.id}>
                    {showSeparator && (
                      <div className="col-span-full flex items-center gap-3 my-4">
                        <span className="text-xs font-black tracking-widest text-slate-500 uppercase shrink-0">
                          Options & Modifiers
                        </span>
                        <div className="h-[1px] bg-slate-800 flex-grow"></div>
                      </div>
                    )}
                    <button
                      onClick={() => handleAddItem(item)}
                      className="flex flex-col items-center justify-between p-4 h-24 bg-slate-800 hover:bg-slate-750 active:bg-slate-900 rounded border border-slate-700 shadow-md text-center transition-all cursor-pointer"
                    >
                      <div className="flex flex-col items-center justify-center flex-grow">
                        <span className="text-md font-black uppercase text-white leading-tight">{item.name}</span>
                        {item.name2 && <span className="text-xs font-semibold text-slate-400 leading-tight mt-0.5">{item.name2}</span>}
                      </div>
                      <span className="text-sm font-bold text-emerald-400 mt-1">{priceLabel}</span>
                    </button>
                  </React.Fragment>
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
      {showConfigModal && renderConfigModal()}

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
