const Excel = require('exceljs');
const db = require('./firestore');
const { downloadImageFromGCS } = require('./products');

async function createOrder(orderData) {
  const orderRef = db.collection('orders').doc(); // creates a new document in the 'orders' collection
  await orderRef.set(orderData);
  return orderRef.id; // returns the new order ID
}

async function getAllOrders() {
  const orderRef = db.collection('orders');
  const snapshot = await orderRef.get();
  const orders = [];
  snapshot.forEach(doc => {
    orders.push({ id: doc.id, ...doc.data() });
  });
  return orders;
}

async function getOrderById(orderId) {
  const orderRef = db.collection('orders').doc(orderId);
  const doc = await orderRef.get();
  if (!doc.exists) {
    throw new Error('No order found with the given ID.');
  }
  return doc.data();
}

async function updateOrder(orderId, updatedData) {
  const orderRef = db.collection('orders').doc(orderId);
  await orderRef.update(updatedData);
  return orderId; // returns the updated order ID
}

const deleteOrder = async (req, res) => {
    const orderId = req.params.orderId;
    try {
        await db.collection('orders').doc(orderId).delete();
        res.status(200).send({ status: 'Success', message: 'Order deleted successfully' });
    } catch (error) {
        res.status(500).send({ status: 'Error', message: error.message });
    }
};

async function exportOrder(req, res) {
  try {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Order Items');

    // Define columns for the items table
    worksheet.columns = [
      { header: 'Image', key: 'image', width: 15 }, // Placeholder for images
      { header: 'Product Name', key: 'product_name', width: 30 },
      { header: 'Number of Pieces', key: 'number_of_pieces', width: 20 },
      { header: 'Pieces per Kilo', key: 'pieces_per_kilo', width: 20 },
      { header: 'Price', key: 'price', width: 10 },
      { header: 'Total Price', key: 'total_price', width: 15 },
    ];

    // Example: Fetch the order items from Firestore (assuming order ID is provided)
    const orderId = req.params.orderId; // Get order ID from URL or request body
    const itemsRef = db.collection('orders').doc(orderId).collection('items');
    const snapshot = await itemsRef.get();

    await Promise.all(snapshot.docs.map(async doc => {
      const data = doc.data();
      const row = worksheet.addRow({
        product_name: data.product_name,
        number_of_pieces: data.number_of_pieces,
        pieces_per_kilo: data.pieces_per_kilo,
        price: data.price,
        total_price: data.total_price,
      });

      if (data.picture_url) {
        try {
          const imageBuffer = await downloadImageFromGCS(data.picture_url);
          const imageId = workbook.addImage({
            buffer: imageBuffer,
            extension: 'jpeg',
          });

          worksheet.addImage(imageId, {
            tl: { col: 0.8, row: row.number - 1 + 0.3},
            ext: { width: 50, height: 50 }
          });

          worksheet.getRow(row.number).height = 60; // Adjust row height to fit the image
        } catch (error) {
          console.error(`Failed to download or embed image for item ${data.product_name}: ${error.message}`);
        }
      }
    }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="order_items.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Failed to create Excel file for order items:', error);
    res.status(500).send({ error: 'Failed to export order items to Excel', detail: error.message });
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  exportOrder
};