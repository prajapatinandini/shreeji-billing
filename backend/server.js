require('dotenv').config(); // .env file load karne ke liye
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Frontend ko backend se connect karne ke liye
app.use(cors()); 
app.use(express.json());

// MongoDB connection string ab .env file se aayegi
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Database se connect ho gaya!'))
  .catch(err => console.error('MongoDB connection error:', err));

// Bill ka structure (Schema)
const invoiceSchema = new mongoose.Schema({
  invoiceNo: String,
  date: String,
  financialYear: Number,
  toName: String,
  address: String,
  gstNo: String,
  items: Array,
  applyGst: Boolean
}, { timestamps: true });

const Invoice = mongoose.model('Invoice', invoiceSchema);

// April se naya financial year nikalne ka logic
const getFinancialYear = (dateString) => {
  const d = new Date(dateString);
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  return month >= 4 ? year : year - 1; 
};

// Naya Invoice Number mangne ka API
app.get('/api/next-invoice-no', async (req, res) => {
  try {
    const { date } = req.query;
    const currentFY = getFinancialYear(date || new Date());
    
    // Sirf is saal ke bills check karein
    const invoices = await Invoice.find({ financialYear: currentFY });
    
    let maxNo = 0;
    invoices.forEach(inv => {
      const no = parseInt(inv.invoiceNo) || 0;
      if (no > maxNo) maxNo = no;
    });
    
    res.json({ nextInvoiceNo: String(maxNo + 1) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Purane sabhi bills lane ka API (List dikhane ke liye)
app.get('/api/invoices', async (req, res) => {
  try {
    // Sabhi bills ko naye se purane ke kram me layenge
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Naya Bill Save karne ka API
app.post('/api/invoices', async (req, res) => {
  try {
    const data = req.body;
    data.financialYear = getFinancialYear(data.date);
    
    const newInvoice = new Invoice(data);
    await newInvoice.save();
    
    res.json({ success: true, message: 'Bill Database mein save ho gaya!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Purane Bill ko Update (Edit) karne ka API
app.put('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    data.financialYear = getFinancialYear(data.date);
    
    const updatedInvoice = await Invoice.findByIdAndUpdate(id, data, { new: true });
    
    if (!updatedInvoice) {
      return res.status(404).json({ success: false, message: 'Bill nahi mila!' });
    }
    
    res.json({ success: true, message: 'Bill Update Ho Gaya!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Port bhi ab .env se aayega (Default 5000)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend server chalu hai: http://localhost:${PORT}`));