const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'vajravel-secret-key-prod-2026';

// ─────────────────── EXPRESS APP ───────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('<h2>🧨 Vajravel Crackers POS API is Online!</h2><p>This backend API is not meant to be visited in the browser. Next step: Connect your frontend web app to this URL.</p>');
});

// ─────────────────── AUTH MIDDLEWARE ───────────────────
const authMiddleware = (req, res, next) => {
  // Allow auth routes to bypass using originalUrl to avoid mounting path issues
  if (req.originalUrl.startsWith('/api/auth') || req.originalUrl.startsWith('/api/seed')) return next();
  
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
  
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(403).json({ error: 'Unauthorized: Invalid token' });
  }
};

app.use('/api', authMiddleware);

// ─────────────────── MONGOOSE MODELS ───────────────────
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }
});
const User = mongoose.model('User', userSchema);

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
});
const Category = mongoose.model('Category', categorySchema);

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  price: { type: Number, required: true },
  costPrice: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  unit: { type: String, default: 'pcs' },
  categoryName: { type: String, required: true }
}, { timestamps: true });
const Product = mongoose.model('Product', productSchema);

const saleItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  sku: String,
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true }
});

const saleSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  customerName: { type: String, default: 'Walk-in Customer' },
  customerPhone: { type: String, default: '' },
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paymentMethod: { type: String, default: 'cash' },
  status: { type: String, default: 'completed' },
  items: [saleItemSchema]
}, { timestamps: true });
const Sale = mongoose.model('Sale', saleSchema);

// Helper for sending objects with string IDs instead of _id
const toJSON = (doc) => {
  const obj = doc.toObject ? doc.toObject() : doc;
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  if (obj.items) obj.items.forEach(i => { i.id = i._id?.toString(); delete i._id; });
  return obj;
};

// ──────────────────── AUTH ROUTES ────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { username: user.username, role: user.role } });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: 'Username already taken' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashedPassword, role: role || 'admin' });
    res.json({ success: true, message: 'User created', user: { username, role: user.role, _id: user._id } });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort('username');
    res.json(users.map(u => ({ id: u._id.toString(), username: u.username, role: u.role })));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ──────────────────── CATEGORIES ────────────────────
app.get('/api/categories', async (req, res) => {
  const cats = await Category.find().sort('name');
  res.json(cats.map(toJSON));
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    let cat = await Category.findOne({ name });
    if (!cat) cat = await Category.create({ name });
    res.json(toJSON(cat));
  } catch(err) { res.status(500).json({ error: err.message }); }
});


// ──────────────────── PRODUCTS ────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort('name');
    res.json(products.map(toJSON));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products', async (req, res) => {
  try {
    const doc = await Product.create(req.body);
    res.json(toJSON(doc));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ──────────────────── SALES / BILLING ────────────────────
app.get('/api/sales', async (req, res) => {
  try {
    const sales = await Sale.find().sort({ createdAt: -1 });
    res.json(sales.map(toJSON));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sales', async (req, res) => {
  try {
    const { customerName, customerPhone, items, subtotal, discount, tax, total, paymentMethod } = req.body;

    // Generate invoice number
    const count = await Sale.countDocuments();
    const invoiceNumber = `VC-${String(count + 1).padStart(5, '0')}`;

    // Format items
    const saleItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (product) {
        saleItems.push({
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price
        });
        // Update stock
        product.stock -= item.quantity;
        await product.save();
      }
    }

    const sale = await Sale.create({
      invoiceNumber,
      customerName: customerName || 'Walk-in Customer',
      customerPhone,
      subtotal, discount, tax, total, paymentMethod,
      items: saleItems
    });

    res.json(toJSON(sale));
  } catch (err) {
    console.error('Sale creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sales', async (req, res) => {
  try {
    await Sale.deleteMany({});
    res.json({ success: true, message: 'Sales history cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────── DASHBOARD STATS ────────────────────
app.get('/api/dashboard', async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalSales = await Sale.countDocuments();
    const lowStock = await Product.countDocuments({ stock: { $lt: 10 } });

    const revenueResult = await Sale.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todaySalesResult = await Sale.aggregate([
      { $match: { createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]);

    res.json({
      totalProducts,
      totalSales,
      totalRevenue,
      lowStock,
      todayRevenue: todaySalesResult.length > 0 ? todaySalesResult[0].total : 0,
      todayOrders: todaySalesResult.length > 0 ? todaySalesResult[0].count : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────── SEED ENDPOINT ────────────────────
app.post('/api/seed', async (req, res) => {
  try {
    // Seed default admin if no users exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const hashedPassword = await bcrypt.hash('admin', 10);
      await User.create({ username: 'admin', password: hashedPassword, role: 'admin' });
    }

    const categories = ['Ground Chakkar', 'Rockets', 'Flower Pots', 'Sparklers', 'Bombs', 'Fancy Items', 'Gift Boxes'];
    for (const name of categories) {
      await Category.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
    }

    const products = [
      { name: 'Classic Ground Chakkar', sku: 'GC-001', price: 120, costPrice: 80, stock: 200, unit: 'box', categoryName: 'Ground Chakkar' },
      { name: 'Big Ground Chakkar', sku: 'GC-002', price: 250, costPrice: 170, stock: 150, unit: 'box', categoryName: 'Ground Chakkar' },
      { name: 'Deluxe Ground Chakkar', sku: 'GC-003', price: 400, costPrice: 280, stock: 100, unit: 'box', categoryName: 'Ground Chakkar' },
      { name: 'Single Rocket', sku: 'RK-001', price: 80, costPrice: 50, stock: 500, unit: 'pcs', categoryName: 'Rockets' },
      { name: 'Whistling Rocket', sku: 'RK-002', price: 150, costPrice: 100, stock: 300, unit: 'pcs', categoryName: 'Rockets' },
      { name: 'Sky Shot Rocket', sku: 'RK-003', price: 350, costPrice: 230, stock: 180, unit: 'box', categoryName: 'Rockets' },
      { name: 'Small Flower Pot', sku: 'FP-001', price: 60, costPrice: 35, stock: 400, unit: 'pcs', categoryName: 'Flower Pots' },
      { name: 'Medium Flower Pot', sku: 'FP-002', price: 120, costPrice: 75, stock: 250, unit: 'pcs', categoryName: 'Flower Pots' },
      { name: 'Mega Flower Pot', sku: 'FP-003', price: 300, costPrice: 200, stock: 120, unit: 'pcs', categoryName: 'Flower Pots' },
      { name: '10cm Sparkler', sku: 'SP-001', price: 30, costPrice: 18, stock: 1000, unit: 'box', categoryName: 'Sparklers' },
      { name: '15cm Color Sparkler', sku: 'SP-002', price: 50, costPrice: 30, stock: 800, unit: 'box', categoryName: 'Sparklers' },
      { name: '30cm Electric Sparkler', sku: 'SP-003', price: 100, costPrice: 65, stock: 600, unit: 'box', categoryName: 'Sparklers' },
      { name: 'Atom Bomb', sku: 'BM-001', price: 200, costPrice: 130, stock: 300, unit: 'box', categoryName: 'Bombs' },
      { name: 'Hydrogen Bomb', sku: 'BM-002', price: 350, costPrice: 220, stock: 200, unit: 'box', categoryName: 'Bombs' },
      { name: 'Laxmi Bomb', sku: 'BM-003', price: 90, costPrice: 55, stock: 450, unit: 'pcs', categoryName: 'Bombs' },
      { name: 'Fountain Special', sku: 'FN-001', price: 500, costPrice: 330, stock: 100, unit: 'pcs', categoryName: 'Fancy Items' },
      { name: 'Color Smoke', sku: 'FN-002', price: 80, costPrice: 45, stock: 350, unit: 'pcs', categoryName: 'Fancy Items' },
      { name: 'Butterfly', sku: 'FN-003', price: 180, costPrice: 110, stock: 200, unit: 'box', categoryName: 'Fancy Items' },
      { name: 'Twinkling Star', sku: 'FN-004', price: 250, costPrice: 160, stock: 180, unit: 'box', categoryName: 'Fancy Items' },
      { name: 'Gift Box Small', sku: 'GB-001', price: 999, costPrice: 650, stock: 50, unit: 'box', categoryName: 'Gift Boxes' },
      { name: 'Gift Box Medium', sku: 'GB-002', price: 1999, costPrice: 1300, stock: 40, unit: 'box', categoryName: 'Gift Boxes' },
      { name: 'Gift Box Large', sku: 'GB-003', price: 3499, costPrice: 2300, stock: 30, unit: 'box', categoryName: 'Gift Boxes' },
      { name: 'Gift Box Premium', sku: 'GB-004', price: 5999, costPrice: 4000, stock: 20, unit: 'box', categoryName: 'Gift Boxes' },
      { name: 'Mega Gift Box', sku: 'GB-005', price: 9999, costPrice: 6500, stock: 10, unit: 'box', categoryName: 'Gift Boxes' },
      { name: 'Pencil Sparkler', sku: 'SP-004', price: 40, costPrice: 22, stock: 700, unit: 'box', categoryName: 'Sparklers' },
    ];

    for (const p of products) {
      await Product.findOneAndUpdate({ sku: p.sku }, p, { upsert: true, new: true });
    }

    res.json({ success: true, message: 'Seeded 7 categories and 25 products to MongoDB' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ──────────────────── START ────────────────────
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in .env file!');
  console.error('Please add MONGODB_URI=mongodb+srv://... to your .env file and restart.');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB online');
    app.listen(PORT, () => {
      console.log(`🧨 Vajravel Crackers POS API running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
