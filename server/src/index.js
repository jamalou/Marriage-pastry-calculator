const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { createOrder, updateOrder, getOrderById, getAllOrders, getOrderItem, getOrderItems, deleteOrder, exportOrder } = require('./order');
const { addItemToOrder, updateItemInOrder, deleteItemFromOrder } = require('./orderItems');
const { importProducts, addProduct, listProducts, updateProduct, deleteProduct, searchProducts, exportProducts } = require('./products');
const { uploadImage, processImage } = require('./uploadImage');
const { uploadFileToGCS } = require('./gcs');
const db = require('./firestore');

const app = express();

const multerStorage = multer.memoryStorage();

const upload = multer({
  storage: multerStorage,
  fileFilter: (req, file, cb) => {
    // Check if the uploaded file is a CSV
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true); // Accept the file
    } else {
      // If the file is not CSV, reject it and send an error message
      cb(new Error('Only CSV files are allowed!'), false);
    }
  }
});

app.use(bodyParser.json());
app.use(cors());

// asdfasfa

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log(username, password)
  try {
      const usersRef = db.collection('users');
      const snapshot = await usersRef.where('user_name', '==', username).get();
      if (snapshot.empty) {
          console.log('No user found with that username.');
          return res.status(401).json({ error: "User does not exist" });
      }

      const userDoc = snapshot.docs[0]; // Assuming username is unique and only taking the first document
      const user = userDoc.data();
      console.log(user)
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (passwordMatch) {
          console.log("password mathched")
          const token = jwt.sign({ userId: userDoc.id }, 'your_secret_key', { expiresIn: '1h' });
          const refreshToken = jwt.sign({ userId: userDoc.id }, 'your_refresh_secret_key', { expiresIn: '24h' });
          res.json({ accessToken: token, refreshToken: refreshToken });
      } else {
          return res.status(401).json({ error: "Invalid credentials" });
      }
  } catch (error) {
      console.error('Error accessing Firestore or other internal error:', error);
      return res.status(500).json({ error: "Internal server error" });
  }
});

// Middleware to validate JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);
  jwt.verify(token, 'your_secret_key', (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
  });
}

// import csv products file
app.post('/products/csv', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  try {
    const filePath = await uploadFileToGCS(req.file);
    const numImported = await importProducts(filePath);
    
    res.status(200).send(`${numImported} products imported successfully.`);
  } catch (error) {
    res.status(500).send('Failed to import products: ' + error.message);
  }
});

// List all products 
app.get('/products', listProducts);

// Route to add a new product
app.post('/products', addProduct);

// Update a product by ID
app.patch('/products/:productId', updateProduct);

// DELETE endpoint to remove a product by ID
app.delete('/products/:productId', async (req, res) => {
  try {
      const productId = req.params.productId;
      const result = await deleteProduct(productId);
      res.status(200).send(result);
  } catch (error) {
      if (error.message === 'Product not found') {
          res.status(404).send({ error: error.message });
      } else {
          res.status(500).send({ error: 'Failed to delete the product' });
      }
  }
});

// Export all products to an Excel file
app.get('/products/excel', exportProducts);

// upload an image for a specific order
app.post('/products/upload-image/:productId', uploadImage, processImage);

// Search for products by name
app.get('/search', async (req, res) => {
  try {
    const results = await searchProducts(req.query.term);
    res.json(results);
  } catch (error) {
    res.status(500).send('Error searching products: ' + error.message);
  }
});

// Create a new order
app.post('/orders', async (req, res) => {
  try {
    const orderData = req.body
    const order = await createOrder(orderData);
    res.status(201).send({
      status: 'Success',
      message: `Order created successfully with ID: ${order.id}`,
      order: order
    });
  } catch (error) {
    res.status(500).send({message: `Error creating order: ${error.message}`});
  }
});
// delete an order by ID
app.delete('/orders/:orderId', deleteOrder);

// Fetch a single order by ID or all orders if no ID is provided
app.get('/orders/:orderId?', async (req, res) => {
  try {
    if (req.params.orderId) {
      const order = await getOrderById(req.params.orderId);
      res.json(order);
    } else {
      const orders = await getAllOrders();
      res.json(orders);
    }
  } catch (error) {
    res.status(404).send(error.message); // Using 404 for "not found" errors
  }
});

// Update an order by ID
app.patch('/orders/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const updatedOrder = await updateOrder(orderId, req.body);
    res.status(200).send({
      status: 'Success',
      message: `Order with ID: ${orderId} updated successfully `,
      order: updatedOrder
    });
  } catch (error) {
    res.status(500).send(`Error updating order: ${error.message}`);
  }
});

// Endpoint to add an item to an order based on the product ID and provided weight or number of pieces
app.post('/orders/:orderId/items', async (req, res) => {
  try {
      const { orderId } = req.params;
      const itemData = {
          ...req.body
      };
      const item = await addItemToOrder(orderId, itemData);
      res.status(201).send(
        {
          status: 'Success',
          message: `Item added successfully with ID: ${item.id}`,
          item: item
        });
  } catch (error) {
      res.status(500).send(`Error adding item to order: ${error.message}`);
  }
});

// Endpoint to update an item in an order
// Define the endpoint for updating an order item
app.patch('/orders/:orderId/items/:itemId', async (req, res) => {
  const { orderId, itemId } = req.params;
  const updateData = req.body;
  try {
      await updateItemInOrder(orderId, itemId, updateData);
      res.status(200).send({ message: 'Item updated successfully' });
  } catch (error) {
      res.status(400).send({ error: error.message });
  }
});

// get order's items (if itemId is passed, get that specific item)
app.get('/orders/:orderId/items/:itemId?', async (req, res) => {
  try {
      const { orderId, itemId } = req.params;
      // Check if an item ID was provided
      if (itemId) {
          // Get a specific item from the order
          const item = await getOrderItem(orderId, itemId);
          res.status(200).json(item);
      } else {
          // Get all items from the order
          const items = await getOrderItems(orderId);
          res.status(200).json(items);
      }
  } catch (error) {
      if (error.message === 'Item not found') {
          res.status(404).send({ error: error.message });
      } else {
          res.status(500).send({ error: error.message });
      }
  }
});

// Endpoint to delete an item from an order
app.delete('/orders/:orderId/items/:itemId', async (req, res) => {
    try {
        const itemId = await deleteItemFromOrder(req.params.orderId, req.params.itemId);
        res.status(200).send(`Item deleted successfully with ID: ${itemId}`);
    } catch (error) {
        res.status(500).send(`Error deleting item from order: ${error.message}`);
    }
});

// Define the endpoint for exporting order items to Excel
app.get('/orders/export-excel/:orderId', (req, res) => {
  exportOrder(req, res);
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
