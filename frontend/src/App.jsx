import React, { useState, useEffect } from 'react';
import { Printer, Plus, Trash2, FileText, FileSpreadsheet, Building2, ArrowLeft, CheckCircle, History, Edit, Share2 } from 'lucide-react';

// Common Units (English)
const commonUnits = ['Sq.Ft', 'Cu.Ft', 'R.Ft', 'Nos', 'Ltr', 'Lumpsum', '-'];

// Default Items
const defaultQuotationItems = [
  { id: 1, desc: 'Shed (Godown) 20 feet RCC, Bricks work, Plaster...', unit: 'Sq.Ft', qty: '1325', rate: '450', amount: '596250' },
  { id: 2, desc: 'Electric room, shed, RCC and bricks work...', unit: 'Sq.Ft', qty: '100', rate: '240', amount: '24000' },
  { id: 3, desc: 'Office with elevation kitchen, drawing room...', unit: 'Sq.Ft', qty: '527', rate: '650', amount: '342550' }
];

// Default Notes
const defaultNotes = [
  "1. Measurements below 1 foot will be considered as running foot.",
  "2. Electricity and water arrangements will be the responsibility of the client.",
  "3. Labour charges for carrying materials beyond 50 feet will be charged extra.",
  "4. A 10% extra charge will be applicable for work at heights above 10 feet."
];

// Backend URL setup safely
let API_BASE_URL = 'http://localhost:5000';
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  API_BASE_URL = 'https://shreeji-billing.onrender.com';
}
// Clean trailing slash just in case
if (API_BASE_URL.endsWith('/')) {
  API_BASE_URL = API_BASE_URL.slice(0, -1);
}

export default function App() {
  const [appState, setAppState] = useState('home'); // 'home', 'invoice', 'quotation', 'history'
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // History State
  const [historyList, setHistoryList] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyType, setHistoryType] = useState('invoice'); 
  const [editingId, setEditingId] = useState(null); 

  const todayDate = new Date().toISOString().split('T')[0];

  const getEmptyInvoice = () => ({
    toName: '', address: '', gstNo: '', date: todayDate, invoiceNo: '',
    items: [{ id: Date.now(), desc: '', unit: 'Lumpsum', qty: '', rate: '', amount: '' }],
    applyGst: true
  });

  const getEmptyQuotation = () => ({
    toName: '', address: '', date: todayDate, 
    items: [...defaultQuotationItems],
    notes: [...defaultNotes]
  });

  const [invoice, setInvoice] = useState(getEmptyInvoice());
  const [quotation, setQuotation] = useState(getEmptyQuotation());

  // CSS and PDF Library Loading
  useEffect(() => {
    // Load Tailwind
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
    // Load html2pdf for direct PDF Sharing
    if (!document.getElementById('html2pdf-cdn')) {
      const script2 = document.createElement('script');
      script2.id = 'html2pdf-cdn';
      script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      document.head.appendChild(script2);
    }
  }, []);

  // Fetch Invoice Number
  useEffect(() => {
    if (appState !== 'invoice' || editingId !== null) return;
    
    const fetchLastInvoiceNo = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/next-invoice-no?date=${invoice.date || todayDate}`);
        if(response.ok) {
           const data = await response.json();
           setInvoice(prev => ({ ...prev, invoiceNo: data.nextInvoiceNo }));
        }
      } catch (error) {
        console.log("Backend offline, using default invoice no.");
      }
    };
    fetchLastInvoiceNo();
  }, [appState, invoice.date, editingId]);

  // History Fetch Logic
  useEffect(() => {
    if (appState === 'history') {
      setIsLoadingHistory(true);
      const endpoint = historyType === 'invoice' ? '/api/invoices' : '/api/quotations';
      fetch(`${API_BASE_URL}${endpoint}`)
        .then(res => res.json())
        .then(data => {
          setHistoryList(data);
          setIsLoadingHistory(false);
        })
        .catch(err => {
          console.error("Failed to fetch history", err);
          setIsLoadingHistory(false);
        });
    }
  }, [appState, historyType]);

  const formatCurrency = (amount) => {
    if (!amount || isNaN(amount)) return '';
    return Number(amount).toLocaleString('en-IN');
  };

  const handleItemChange = (stateType, id, field, value) => {
    const setState = stateType === 'invoice' ? setInvoice : setQuotation;
    setState(prev => {
      const newItems = prev.items.map(item => {
        if (item.id === id) {
          let updated = { ...item, [field]: value };
          if (field === 'qty' || field === 'rate') {
             const q = Number(updated.qty) || (updated.qty === '' && updated.rate !== '' ? 1 : 0); 
             const r = Number(updated.rate) || 0;
             if (updated.qty !== '' || updated.rate !== '') {
               updated.amount = (q * r).toString();
             }
          }
          return updated;
        }
        return item;
      });
      return { ...prev, items: newItems };
    });
  };

  const handleNoteChange = (index, value) => {
    const newNotes = [...quotation.notes];
    newNotes[index] = value;
    setQuotation({ ...quotation, notes: newNotes });
  };
  const addNote = () => setQuotation({ ...quotation, notes: [...quotation.notes, ""] });
  const removeNote = (index) => setQuotation({ ...quotation, notes: quotation.notes.filter((_, i) => i !== index) });

  const calculateTotals = (items, applyGst) => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const gstAmount = applyGst ? Math.round(subtotal * 0.09) : 0;
    const total = subtotal + (gstAmount * 2);
    return { subtotal, gstAmount, total };
  };

  // COMMON SAVE LOGIC (Database)
  const saveToDatabase = async () => {
    try {
      const endpoint = appState === 'invoice' ? '/api/invoices' : '/api/quotations';
      const url = editingId ? `${API_BASE_URL}${endpoint}/${editingId}` : `${API_BASE_URL}${endpoint}`;
      const method = editingId ? 'PUT' : 'POST';
      const payload = appState === 'invoice' ? invoice : quotation;

      await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const resetFormAndGoHome = () => {
    setShowSuccess(false);
    setEditingId(null);
    if (appState === 'invoice') setInvoice(getEmptyInvoice());
    if (appState === 'quotation') setQuotation(getEmptyQuotation());
    setAppState('home');
  };

  // MOBILE FIX + NORMAL PRINT
  const handleSaveAndPrint = async () => {
    setIsSaving(true);
    await saveToDatabase();
    setShowSuccess(true);
    
    setTimeout(() => window.print(), 500);

    setTimeout(() => {
      resetFormAndGoHome();
      setIsSaving(false);
    }, 3000);
  };

  // DIRECT PDF SHARE FEATURE
  const handleDirectPdfShare = async () => {
    if (!window.html2pdf) {
      alert("Please wait 2 seconds, PDF system is loading...");
      return;
    }

    setIsSharing(true);
    
    // 1. Save to database first
    await saveToDatabase();
    setShowSuccess(true);

    // 2. Generate PDF
    const element = document.getElementById('print-paper-content');
    const docType = appState === 'invoice' ? 'Invoice' : 'Quotation';
    const clientName = (appState === 'invoice' ? invoice.toName : quotation.toName) || 'Client';
    const fileName = `${docType}_${clientName}.pdf`.replace(/ /g, '_');

    const opt = {
      margin:       10,
      filename:     fileName,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      // Create Blob
      const pdfBlob = await window.html2pdf().set(opt).from(element).outputPdf('blob');
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

      // 3. Try Native Share
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
          text: `Please find the attached ${docType} from Shreeji Construction.`
        });
      } else {
        // Fallback if browser doesn't support direct share (like PC)
        alert("Direct share not supported on this browser. Downloading PDF automatically.");
        window.html2pdf().set(opt).from(element).save();
      }
    } catch (err) {
      console.error(err);
      alert("Failed to generate PDF. Please use the Print button instead.");
    }

    setIsSharing(false);
    resetFormAndGoHome();
  };

  const handleEditInvoice = (inv) => {
    setEditingId(inv._id);
    setInvoice({
      toName: inv.toName || '',
      address: inv.address || '',
      gstNo: inv.gstNo || '',
      date: inv.date || todayDate,
      invoiceNo: inv.invoiceNo || '',
      items: inv.items && inv.items.length > 0 ? inv.items : [{ id: Date.now(), desc: '', unit: 'Lumpsum', qty: '', rate: '', amount: '' }],
      applyGst: inv.applyGst !== undefined ? inv.applyGst : true
    });
    setAppState('invoice');
  };

  const handleEditQuotation = (quot) => {
    setEditingId(quot._id);
    setQuotation({
      toName: quot.toName || '',
      address: quot.address || '',
      date: quot.date || todayDate,
      items: quot.items && quot.items.length > 0 ? quot.items : [...defaultQuotationItems],
      notes: quot.notes && quot.notes.length > 0 ? quot.notes : [...defaultNotes]
    });
    setAppState('quotation');
  };

  const createNewInvoice = () => {
    setEditingId(null);
    setInvoice(getEmptyInvoice());
    setIsSaving(false);
    setAppState('invoice');
  };

  const createNewQuotation = () => {
    setEditingId(null);
    setQuotation(getEmptyQuotation());
    setIsSaving(false);
    setAppState('quotation');
  };

  const HeaderBlock = () => (
    <div className="flex flex-col items-center border-b-2 border-orange-500 pb-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <svg width="70" height="70" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 20L10 50H20V90H80V50H90L50 20Z" fill="url(#paint0_linear)" />
          <path d="M50 20L10 50H20V90H80V50H90L50 20Z" stroke="#F97316" strokeWidth="4" strokeLinejoin="round" />
          <path d="M80 30L60 15V5H80V30Z" fill="#4B5563" />
          <path d="M40 50H60V70H40V50Z" fill="#374151" />
          <path d="M50 50V70M40 60H60" stroke="white" strokeWidth="2" />
          <path d="M10 80C30 70 70 70 90 80" stroke="#F97316" strokeWidth="4" strokeLinecap="round" />
          <path d="M15 85C35 75 65 75 85 85" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
          <defs>
            <linearGradient id="paint0_linear" x1="50" y1="20" x2="50" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDBA74" />
              <stop offset="1" stopColor="white" />
            </linearGradient>
          </defs>
        </svg>
        <div>
          <h1 className="text-3xl font-bold text-orange-600 tracking-wider leading-none">SHREEJI</h1>
          <h2 className="text-sm font-bold text-gray-700 tracking-widest mt-1 uppercase">Construction</h2>
        </div>
      </div>
      <p className="font-bold text-sm mb-1 uppercase">GST NO.: 24AQVPP1584B1ZN</p>
      <p className="text-xs text-center font-medium max-w-[400px]">60, RAMESHWER RAW HOUSE-2, Nr AJAY TENAMENT-5, OPP RADHE PARK, VASTRAL ROAD, AHMEDABAD, Gujarat, 382418</p>
      <p className="font-bold text-sm mt-1">Mobile no.: 9998318194</p>
    </div>
  );

  if (appState === 'home') {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border-t-8 border-orange-500">
          <div className="flex justify-center mb-6"><Building2 size={60} className="text-orange-500"/></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Shreeji Construction</h2>
          <p className="text-gray-500 mb-8">Kya banana hai aaj?</p>
          <div className="space-y-4">
            <button onClick={createNewInvoice} className="w-full bg-orange-600 hover:bg-orange-700 text-white p-4 rounded-xl text-lg font-bold flex items-center justify-center gap-4 transition-transform active:scale-95 shadow-md">
              <FileText size={24} /> Create Tax Invoice
            </button>
            <button onClick={() => setAppState('history')} className="w-full bg-gray-800 hover:bg-gray-900 text-white p-4 rounded-xl text-lg font-bold flex items-center justify-center gap-4 transition-transform active:scale-95 shadow-md">
              <History size={24} /> View History
            </button>
            <button onClick={createNewQuotation} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl text-lg font-bold flex items-center justify-center gap-4 transition-transform active:scale-95 shadow-md mt-6">
              <FileSpreadsheet size={24} /> Create Quotation
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'history') {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 sm:p-8">
        <div className="w-full max-w-5xl bg-white p-6 sm:p-8 rounded-2xl shadow-xl border-t-8 border-orange-500">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><History className="text-orange-500"/> Document History</h2>
            <button onClick={() => setAppState('home')} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold hover:bg-gray-300 flex items-center gap-2 transition-colors"><ArrowLeft size={18}/> Back</button>
          </div>

          <div className="flex gap-4 mb-6 border-b pb-4">
            <button onClick={() => setHistoryType('invoice')} className={`px-4 py-2 rounded-lg font-bold transition-colors ${historyType === 'invoice' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Tax Invoices</button>
            <button onClick={() => setHistoryType('quotation')} className={`px-4 py-2 rounded-lg font-bold transition-colors ${historyType === 'quotation' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Quotations</button>
          </div>

          {isLoadingHistory ? (
            <div className="text-center py-12">
              <p className="text-gray-800 font-bold text-xl mb-3 flex items-center justify-center gap-2">
                <span className="animate-spin text-2xl">⏳</span> Loading history...
              </p>
              <p className="text-sm text-orange-600 font-medium max-w-md mx-auto bg-orange-50 p-3 rounded border border-orange-200">
                (Note: Free servers take ~50 seconds to wake up if inactive. Kripya 1 minute intezaar karein.)
              </p>
            </div>
          ) : historyList.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500 font-medium">No saved {historyType}s found in database.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 text-sm">
                    <th className="p-3 border-b font-bold">Date</th>
                    {historyType === 'invoice' && <th className="p-3 border-b font-bold text-center">Inv No.</th>}
                    <th className="p-3 border-b font-bold">Client Name</th>
                    <th className="p-3 border-b font-bold text-right">Amount</th>
                    <th className="p-3 border-b font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map((doc) => (
                    <tr key={doc._id} className="hover:bg-orange-50 transition-colors border-b last:border-b-0">
                      <td className="p-3 text-sm">{doc.date ? doc.date.split('-').reverse().join('-') : '-'}</td>
                      {historyType === 'invoice' && <td className="p-3 text-sm text-center font-bold text-orange-700">#{doc.invoiceNo}</td>}
                      <td className="p-3 text-sm font-medium text-gray-800">{doc.toName || 'Unknown'}</td>
                      <td className="p-3 text-sm text-right font-bold text-gray-800">₹{formatCurrency(calculateTotals(doc.items || [], historyType === 'invoice' && doc.applyGst !== undefined ? doc.applyGst : false).total)}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => historyType === 'invoice' ? handleEditInvoice(doc) : handleEditQuotation(doc)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded font-bold text-xs inline-flex items-center gap-1 transition-colors"><Edit size={14} /> Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isEditing = editingId !== null;
  const pageTitle = appState === 'invoice' ? (isEditing ? 'Edit Tax Invoice' : 'New Tax Invoice') : (isEditing ? 'Edit Quotation' : 'New Quotation');

  return (
    <div className="h-screen w-full flex flex-col bg-gray-100 font-sans print-wrapper-1">
      <nav className="bg-orange-600 text-white p-3 shadow-md print:hidden flex items-center justify-between shrink-0 z-50">
        <button onClick={() => setAppState('home')} className="flex items-center gap-2 bg-orange-700 px-3 py-1.5 rounded text-sm font-bold hover:bg-orange-800"><ArrowLeft size={18} /> Home</button>
        <h1 className="font-bold text-lg">{pageTitle}</h1>
        <Building2 size={24} className="opacity-80"/>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full max-w-[1600px] mx-auto print-wrapper-2">
        <div className="order-1 lg:order-2 w-full lg:w-3/5 xl:w-2/3 h-[45vh] lg:h-full overflow-auto bg-gray-300 relative border-b-4 border-gray-400 lg:border-b-0 lg:border-l-4 print-wrapper-3">
          <div className="print:hidden sticky top-0 bg-gray-800/80 text-white text-xs p-1.5 text-center font-medium z-10 backdrop-blur-sm">👁️ Live Preview</div>

          <div className="bg-white shadow-2xl min-w-[700px] sm:min-w-[800px] min-h-[1056px] p-8 mx-auto origin-top mt-2 mb-10 relative flex flex-col print-paper print-page-wrapper">
              
              {/* ID added here to capture the PDF content exactly */}
              <div id="print-paper-content" className="p-4 bg-white">
                <HeaderBlock />
                
                <div className="flex justify-between items-start mb-6">
                  <div className="w-1/2 max-w-[50%] pr-4 text-left">
                    <p className="font-bold text-base mb-1 text-gray-900">To,</p>
                    <p className="font-bold text-lg text-gray-900 leading-tight break-words">{appState === 'invoice' ? invoice.toName : quotation.toName}</p>
                    <p className="whitespace-pre-wrap text-gray-800 text-sm mt-1.5 leading-relaxed break-words">{appState === 'invoice' ? invoice.address : quotation.address}</p>
                    {appState === 'invoice' && invoice.gstNo && <p className="font-bold text-gray-900 mt-2 text-sm uppercase">GST NO.: {invoice.gstNo}</p>}
                  </div>
                  <div className="text-right w-1/2 pl-4">
                    <p className="font-bold text-base text-gray-900 uppercase">Date: {appState === 'invoice' ? (invoice.date ? invoice.date.split('-').reverse().join('-') : '') : (quotation.date ? quotation.date.split('-').reverse().join('-') : '')}</p>
                    {appState === 'invoice' && <p className="font-bold text-base text-gray-900 mt-1 uppercase">Invoice No: {invoice.invoiceNo}</p>}
                  </div>
                </div>

                {appState === 'quotation' && <h2 className="text-center text-xl font-bold mb-4 underline decoration-2 underline-offset-4 tracking-wider uppercase">Quotation</h2>}

                <table className="w-full table-fixed border-collapse border border-gray-400 mb-8 text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-sm">
                      <th className="border border-gray-400 p-1.5 text-center w-[8%]">Sr No.</th>
                      <th className="border border-gray-400 p-1.5 text-left w-[38%]">Description</th>
                      <th className="border border-gray-400 p-1.5 text-center w-[12%]">Quantity</th>
                      <th className="border border-gray-400 p-1.5 text-center w-[12%]">Unit</th>
                      <th className="border border-gray-400 p-1.5 text-center w-[14%]">Rate</th>
                      <th className="border border-gray-400 p-1.5 text-right w-[16%]">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(appState === 'invoice' ? invoice.items : quotation.items).map((item, index) => (
                      <tr key={item.id}>
                        <td className="border border-gray-400 p-1.5 text-center break-words">{index + 1}</td>
                        <td className="border border-gray-400 p-1.5 whitespace-pre-wrap leading-relaxed break-words text-gray-800">{item.desc}</td>
                        <td className="border border-gray-400 p-1.5 text-center break-words">{item.qty}</td>
                        <td className="border border-gray-400 p-1.5 text-center break-words">{item.unit !== '-' ? item.unit.split(' ')[0] : ''}</td>
                        <td className="border border-gray-400 p-1.5 text-center break-words">{item.rate}</td>
                        <td className="border border-gray-400 p-1.5 text-right font-medium break-words">{item.amount ? formatCurrency(item.amount) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tbody className="text-sm">
                    <tr><td colSpan="5" className="border border-gray-400 p-1.5 text-right font-bold uppercase">{appState === 'invoice' ? 'Sub Total' : 'Total'}</td><td className="border border-gray-400 p-1.5 text-right font-bold">{formatCurrency(calculateTotals(appState === 'invoice' ? invoice.items : quotation.items, appState === 'invoice' ? invoice.applyGst : false).subtotal)}</td></tr>
                    {appState === 'invoice' && invoice.applyGst && (
                      <>
                        <tr><td colSpan="5" className="border border-gray-400 p-1.5 text-right font-bold uppercase">CGST 9%</td><td className="border border-gray-400 p-1.5 text-right">{formatCurrency(calculateTotals(invoice.items, true).gstAmount)}</td></tr>
                        <tr><td colSpan="5" className="border border-gray-400 p-1.5 text-right font-bold uppercase">SGST 9%</td><td className="border border-gray-400 p-1.5 text-right">{formatCurrency(calculateTotals(invoice.items, true).gstAmount)}</td></tr>
                      </>
                    )}
                    {appState === 'invoice' && (
                      <tr>
                        <td colSpan="5" className="border border-gray-400 p-2.5 text-right font-bold text-lg bg-gray-50 uppercase">Grand Total</td>
                        <td className="border border-gray-400 p-2.5 text-right font-bold text-lg bg-gray-50">{formatCurrency(calculateTotals(invoice.items, invoice.applyGst).total)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {appState === 'quotation' && quotation.notes.length > 0 && (
                  <div className="mt-4 mb-8">
                    <p className="font-bold mb-1 underline text-base">Notes:</p>
                    {quotation.notes.map((note, index) => note.trim() !== '' && <p key={index} className="mb-1 text-gray-800 text-sm">{note}</p>)}
                  </div>
                )}

                <div className="mt-auto flex justify-end pb-8">
                  <div className="text-center mt-12">
                    <p className="font-bold text-lg mb-12 text-gray-800 uppercase">Shreeji Construction</p>
                    <p className="border-t-2 border-gray-400 pt-1 px-4 text-gray-600 text-sm">Authorized Signatory</p>
                  </div>
                </div>
              </div>
          </div>
        </div>

        <div className="order-2 lg:order-1 w-full lg:w-2/5 xl:w-1/3 h-[55vh] lg:h-full flex flex-col bg-white print:hidden">
          <div className="bg-orange-100 text-orange-800 p-2 text-center text-sm font-bold border-b border-orange-200 shrink-0 sticky top-0 z-10 uppercase">
            {editingId ? `✏️ Editing Old ${appState}` : '✍️ Fill Details'}
          </div>
          <div className="flex-1 overflow-auto p-4 sm:p-6 pb-24">
            {appState === 'invoice' ? (
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-1/2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Date:</label>
                    <input type="date" value={invoice.date} onChange={e => setInvoice({...invoice, date: e.target.value})} className="w-full p-2 border rounded text-sm outline-none focus:border-orange-500" />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Invoice No:</label>
                    <input type="text" value={invoice.invoiceNo} onChange={e => setInvoice({...invoice, invoiceNo: e.target.value})} className="w-full p-2 border bg-orange-50 rounded text-center font-bold text-orange-700 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Client Name:</label>
                  <input type="text" value={invoice.toName} onChange={e => setInvoice({...invoice, toName: e.target.value})} placeholder="Kaun hai client?" className="w-full p-2 border rounded font-bold outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Address:</label>
                  <textarea value={invoice.address} onChange={e => setInvoice({...invoice, address: e.target.value})} placeholder="Client ka pata..." className="w-full p-2 border rounded h-16 outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">GSTIN:</label>
                  <input type="text" value={invoice.gstNo} onChange={e => setInvoice({...invoice, gstNo: e.target.value})} placeholder="Client ka GST No." className="w-full p-2 border rounded uppercase outline-none focus:border-orange-500" />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Date:</label>
                  <input type="date" value={quotation.date} onChange={e => setQuotation({...quotation, date: e.target.value})} className="w-full p-2 border rounded outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Client Name:</label>
                  <input type="text" value={quotation.toName} onChange={e => setQuotation({...quotation, toName: e.target.value})} placeholder="Name..." className="w-full p-2 border rounded font-bold outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Site Address:</label>
                  <textarea value={quotation.address} onChange={e => setQuotation({...quotation, address: e.target.value})} placeholder="Address..." className="w-full p-2 border rounded h-16 outline-none focus:border-orange-500" />
                </div>
              </div>
            )}

            <div className="pt-4 mt-4 border-t-2 border-gray-100">
              <div className="flex justify-between items-center mb-3 bg-gray-50 p-2 rounded">
                <h3 className="font-bold text-sm uppercase">Items</h3>
                {appState === 'invoice' && <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={invoice.applyGst} onChange={e => setInvoice({...invoice, applyGst: e.target.checked})} className="w-4 h-4"/><span className="text-xs font-bold">GST</span></label>}
              </div>

              {(appState === 'invoice' ? invoice.items : quotation.items).map((item, index) => (
                <div key={item.id} className="bg-gray-50 p-3 rounded-xl border border-gray-200 mb-4 relative">
                  <button onClick={() => {
                     const list = appState === 'invoice' ? invoice.items : quotation.items;
                     if(list.length === 1) return;
                     if(appState === 'invoice') setInvoice(p => ({...p, items: p.items.filter(i => i.id !== item.id)}));
                     else setQuotation(p => ({...p, items: p.items.filter(i => i.id !== item.id)}));
                  }} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full"><Trash2 size={14} /></button>
                  
                  <textarea value={item.desc} onChange={e => handleItemChange(appState, item.id, 'desc', e.target.value)} placeholder="Description..." className="w-full p-2 mb-2 border rounded text-xs outline-none focus:border-orange-500" rows="2" />
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input type="number" value={item.qty} onChange={e => handleItemChange(appState, item.id, 'qty', e.target.value)} placeholder="Qty" className="p-2 border rounded text-center text-xs outline-none" />
                    <select value={item.unit} onChange={e => handleItemChange(appState, item.id, 'unit', e.target.value)} className="p-2 border rounded text-xs bg-white outline-none">
                      {commonUnits.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={item.rate} onChange={e => handleItemChange(appState, item.id, 'rate', e.target.value)} placeholder="Rate" className="p-2 border rounded text-center text-xs outline-none" />
                    <input type="number" value={item.amount} onChange={e => handleItemChange(appState, item.id, 'amount', e.target.value)} placeholder="Amount" className="p-2 border-2 border-blue-200 bg-blue-50 rounded text-center text-xs font-bold outline-none" />
                  </div>
                </div>
              ))}
              <button onClick={() => {
                const newItem = { id: Date.now(), desc: '', unit: 'Lumpsum', qty: '', rate: '', amount: '' };
                if(appState === 'invoice') setInvoice(p => ({...p, items: [...p.items, newItem]}));
                else setQuotation(p => ({...p, items: [...p.items, newItem]}));
              }} className="w-full py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded border-2 border-dashed border-blue-200 flex justify-center items-center gap-2"><Plus size={16} /> Add Item</button>
            </div>

            {appState === 'quotation' && (
              <div className="pt-4 mt-4 border-t-2 border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-sm uppercase text-gray-800">Terms & Conditions</h3>
                  <button onClick={() => setQuotation({ ...quotation, notes: [...defaultNotes] })} className="text-xs font-bold text-orange-700 hover:text-orange-800 underline">Reset</button>
                </div>
                
                {quotation.notes.map((note, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input type="text" value={note} onChange={e => handleNoteChange(index, e.target.value)} className="w-full p-2 border rounded text-sm focus:border-orange-500 outline-none" placeholder="Enter note..." />
                    <button onClick={() => removeNote(index)} className="bg-red-50 text-red-500 px-3 rounded hover:bg-red-100"><Trash2 size={16} /></button>
                  </div>
                ))}
                
                <button onClick={addNote} className="w-full mt-2 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 font-bold rounded border border-dashed border-gray-300 flex justify-center items-center gap-2 text-sm"><Plus size={16} /> Add Custom Note</button>
              </div>
            )}
          </div>
          
          <div className="bg-white p-4 border-t shadow-inner shrink-0 z-20">
            {showSuccess && <div className="text-center text-green-600 font-bold text-sm mb-2"><CheckCircle size={16} className="inline mr-1"/> Saved to Database!</div>}
            
            <div className="flex flex-col gap-3">
              <button onClick={handleSaveAndPrint} disabled={isSaving || isSharing} className={`w-full ${isSaving ? 'bg-gray-400' : 'bg-gray-800 hover:bg-gray-900'} text-white p-3 rounded-xl text-lg font-bold flex justify-center items-center gap-2 shadow-md transition-transform active:scale-95`}>
                <Printer size={20} /> {isSaving ? 'Saving...' : 'Save & Print normally'}
              </button>
              
              <button onClick={handleDirectPdfShare} disabled={isSaving || isSharing} className={`w-full ${isSharing ? 'bg-gray-400' : 'bg-[#25D366] hover:bg-[#128C7E]'} text-white p-4 rounded-xl text-lg font-bold flex justify-center items-center gap-2 shadow-md transition-transform active:scale-95`}>
                <Share2 size={20} /> {isSharing ? 'Generating PDF...' : 'Share PDF Direct (WhatsApp)'}
              </button>
            </div>
            
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; }
          body, html, #root { width: 100% !important; height: auto !important; background: white !important; margin: 0 !important; padding: 0 !important; display: block !important; }
          .print\\:hidden { display: none !important; }
          
          /* COMPLETE FLEXBOX DESTRUCTION FOR PRINT */
          .print-wrapper-1, .print-wrapper-2, .print-wrapper-3 {
             display: block !important;
             height: auto !important;
             min-height: 0 !important;
             max-height: none !important;
             overflow: visible !important;
             width: 100% !important;
             position: static !important;
             margin: 0 !important;
             padding: 0 !important;
             background: white !important;
          }

          .print-paper {
             display: block !important;
             height: auto !important;
             min-height: 0 !important;
             width: 100% !important;
             margin: 0 !important;
             padding: 0 !important;
             box-shadow: none !important;
             position: static !important;
          }

          /* TABLE FIXES */
          table { width: 100% !important; border-collapse: collapse; table-layout: fixed; page-break-inside: auto; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          td, th { page-break-inside: avoid; word-wrap: break-word; }
          
          .print-page-wrapper { padding: 15mm 15mm !important; }
          @page { margin: 0; size: A4 portrait; }
          ::-webkit-scrollbar { display: none; }
        }
      `}} />
    </div>
  );
}
