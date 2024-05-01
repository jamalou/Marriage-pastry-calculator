const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const searchProducts = require('./searchProducts');
const {createOrder, updateOrder, getOrderById, getAllOrders, deleteOrder, exportOrder} = require('./order');
const { addItemToOrder, updateItemInOrder, deleteItemFromOrder } = require('./orderItems');
const { importProducts, listProducts, updateProduct, exportProducts } = require('./products');
const { uploadImage, processImage } = require('./uploadImage');;

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cors());


app.post('/import-products', async (req, res) => {
  try {
    const numImported = await importProducts(req.body.filePath);
    res.status(200).send(`${numImported} products imported successfully.`);
  } catch (error) {
    res.status(500).send('Failed to import products: ' + error.message);
  }
});

// List all products 
app.get('/list-products', listProducts);
// Update a product by ID
app.patch('/update-product/:productId', updateProduct);
// Export all products to an Excel file
app.get('/export-products', exportProducts);

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
app.post('/create-order', async (req, res) => {
  try {
    const orderId = await createOrder(req.body);
    res.status(201).send(`Order created successfully with ID: ${orderId}`);
  } catch (error) {
    res.status(500).send(`Error creating order: ${error.message}`);
  }
});
// delete an order by ID
app.delete('/delete-order/:orderId', deleteOrder);

// Fetch a single order by ID or all orders if no ID is provided
app.get('/get-order/:orderId?', async (req, res) => {
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
app.patch('/update-order/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    await updateOrder(orderId, req.body);
    res.status(200).send(`Order updated successfully with ID: ${orderId}`);
  } catch (error) {
    res.status(500).send(`Error updating order: ${error.message}`);
  }
});

// Endpoint to add an item to an order
app.post('/orders/:orderId/items', async (req, res) => {
    try {
        const itemId = await addItemToOrder(req.params.orderId, req.body);
        res.status(201).send(`Item added successfully with ID: ${itemId}`);
    } catch (error) {
        res.status(500).send(`Error adding item to order: ${error.message}`);
    }
});

// Endpoint to update an item in an order
// Define the endpoint for updating an order item
app.patch('/update-order-item/:orderId/:itemId', async (req, res) => {
  const { orderId, itemId } = req.params;
  const updateData = req.body;
  try {
      await updateItemInOrder(orderId, itemId, updateData);
      res.status(200).send({ message: 'Item updated successfully' });
  } catch (error) {
      res.status(400).send({ error: error.message });
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


app.post('/upload-image/:productId', uploadImage, processImage);

// Define the endpoint for exporting order items to Excel
app.get('/export-order/:orderId', (req, res) => {
  exportOrder(req, res);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
