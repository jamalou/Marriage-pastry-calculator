const express = require('express');
const bodyParser = require('body-parser');
const importProducts = require('./importProducts');
const searchProducts = require('./searchProducts');
const {createOrder, updateOrder, getOrderById, getAllOrders} = require('./order');
const { addItemToOrder, updateItemInOrder, deleteItemFromOrder } = require('./orderItems');



const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.post('/import-products', async (req, res) => {
  try {
    const numImported = await importProducts(req.body.filePath);
    res.status(200).send(`${numImported} products imported successfully.`);
  } catch (error) {
    res.status(500).send('Failed to import products: ' + error.message);
  }
});

app.get('/search', async (req, res) => {
  try {
    const results = await searchProducts(req.query.term);
    res.json(results);
  } catch (error) {
    res.status(500).send('Error searching products: ' + error.message);
  }
});

app.post('/create-order', async (req, res) => {
  try {
    const orderId = await createOrder(req.body);
    res.status(201).send(`Order created successfully with ID: ${orderId}`);
  } catch (error) {
    res.status(500).send(`Error creating order: ${error.message}`);
  }
});

app.patch('/update-order/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    await updateOrder(orderId, req.body);
    res.status(200).send(`Order updated successfully with ID: ${orderId}`);
  } catch (error) {
    res.status(500).send(`Error updating order: ${error.message}`);
  }
});

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
app.put('/orders/:orderId/items/:itemId', async (req, res) => {
    try {
        const itemId = await updateItemInOrder(req.params.orderId, req.params.itemId, req.body);
        res.status(200).send(`Item updated successfully with ID: ${itemId}`);
    } catch (error) {
        res.status(500).send(`Error updating item in order: ${error.message}`);
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


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
