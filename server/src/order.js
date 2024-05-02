const Excel = require('exceljs');
const db = require('./firestore');
const { downloadImageFromGCS } = require('./products');

async function createOrder(orderData) {
  const orderRef = db.collection('orders').doc(); // creates a new document in the 'orders' collection
  await orderRef.set({ total_price: parseFloat(0.0), total_number_of_pieces: parseInt(0), ...orderData });
  return orderRef.id; // returns the new order ID
}

async function getAllOrders() {
  const orderRef = db.collection('orders');
  const snapshot = await orderRef.get();
  const orders = [];

  for (const doc of snapshot.docs) {
    await computeOrderGlobals(doc.id);
    const orderData = { id: doc.id, ...doc.data() };
    orders.push(orderData);
  }

  return orders;
}

async function getOrderById(orderId) {
  const orderRef = db.collection('orders').doc(orderId);
  await computeOrderGlobals(orderId);
  const doc = await orderRef.get();
  if (!doc.exists) {
    throw new Error('No order found with the given ID.');
  }
  // Fetch the items within this order
  const itemsCollection = orderRef.collection('items');
  const itemsSnapshot = await itemsCollection.get();
  const items = [];
  
  itemsSnapshot.forEach(itemDoc => {
      items.push({ id: itemDoc.id, ...itemDoc.data() });
  });
  
  return { id: doc.id, ...doc.data(), items: items };
}

async function computeOrderGlobals(orderId) {
  const orderRef = db.collection('orders').doc(orderId);
  const doc = await orderRef.get();
  if (!doc.exists) {
    throw new Error('No order found with the given ID.');
  }
  const itemsSnapshot = await orderRef.collection('items').get();
  let orderTotalPrice = 0.0;
  let totalNumberOfPieces = 0;  // Initialize total number of pieces
  let totalWeight = 0.0;

  itemsSnapshot.forEach(doc => {
    const itemData = doc.data();
    if (itemData.total_price) {
      orderTotalPrice += parseFloat(itemData.total_price);
    }
    if (itemData.number_of_pieces) {
      totalNumberOfPieces += parseInt(itemData.number_of_pieces);
    }
    if (itemData.weight) {
      totalWeight += parseFloat(itemData.weight);
    }
  });

  // Update the order with the new total price and total number of pieces
  await orderRef.update({
    total_price: parseFloat(orderTotalPrice.toFixed(2)),
    total_number_of_pieces: totalNumberOfPieces,  // Update the total number of pieces
    totalWeight: parseFloat(totalWeight.toFixed(2))
  });

  return {
    total_price: orderTotalPrice,
    total_number_of_pieces: totalNumberOfPieces,
    totalWeight: totalWeight
  };
}


async function getOrderItems(orderId) {
  const itemsRef = db.collection('orders').doc(orderId).collection('items');
  const snapshot = await itemsRef.get();
  const items = [];

  snapshot.forEach(doc => {
      items.push({ id: doc.id, ...doc.data() });
  });

  return items;
}

async function getOrderItem(orderId, itemId) {
  const itemRef = db.collection('orders').doc(orderId).collection('items').doc(itemId);
  const doc = await itemRef.get();
  if (!doc.exists) {
      throw new Error('Item not found');
  }
  return { id: doc.id, ...doc.data() };
}

async function updateOrder(orderId, updatedData) {
  const orderRef = db.collection('orders').doc(orderId);

  // Prepare updated data with nested fields addressed via dot notation
  const updatePayload = {};
  for (const key in updatedData) {
    if (updatedData.hasOwnProperty(key) && typeof updatedData[key] === 'object' && !Array.isArray(updatedData[key])) {
      for (const subKey in updatedData[key]) {
        if (updatedData[key].hasOwnProperty(subKey)) {
          updatePayload[`${key}.${subKey}`] = updatedData[key][subKey];
        }
      }
    } else {
      updatePayload[key] = updatedData[key];
    }
  }

  // Update the order with the constructed payload
  await orderRef.update(updatePayload);
  await computeOrderGlobals(orderId);
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

    // Set default font for the worksheet
    worksheet.eachRow(function(row) {
      row.eachCell(function(cell) {
        cell.font = { size: 12 };
      });
    });

    // Download and embed the logo from GCS
    const logoUrl = 'https://storage.cloud.google.com/demo_mohamed_jamel/data/logo.jpg';
    const logoImageBuffer = await downloadImageFromGCS(logoUrl);
    const logoImageId = workbook.addImage({
      buffer: logoImageBuffer,
      extension: 'jpeg',
    });
    worksheet.addImage(logoImageId, 'A1:B8');

    // Fetch order details from Firestore
    const orderId = req.params.orderId; // Get the order ID from URL or request body
    // compute the order price to be sure that it is up to date
    await computeOrderGlobals(orderId);
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    const orderData = orderDoc.data();
    console.log('orderData', orderData);

    // Adding Bold Headers for Order Info
    // worksheet.mergeCells('C1:H1');
    worksheet.getCell('C1').value = "Commande";
    worksheet.getCell('C1').font = { bold: true };
    worksheet.getCell('D1').value = orderData.orderName;

    // worksheet.mergeCells('C2:H2');
    worksheet.getCell('C2').value = "Client";
    worksheet.getCell('C2').font = { bold: true };
    worksheet.getCell('D2').value = orderData.customerInfo.name;

    // worksheet.mergeCells('C3:H3');
    worksheet.getCell('C3').value = "Adresse";
    worksheet.getCell('C3').font = { bold: true };
    worksheet.getCell('D3').value = orderData.customerInfo.address;

    // worksheet.mergeCells('C4:H4');
    worksheet.getCell('C4').value = "Numéro de téléphone";
    worksheet.getCell('C4').font = { bold: true };
    worksheet.getCell('D4').value = orderData.customerInfo.phone;

    // worksheet.mergeCells('C5:H5');
    worksheet.getCell('C5').value = "Date de livraison";
    worksheet.getCell('C5').font = { bold: true };
    worksheet.getCell('D5').value = orderData.weddingInfo.deliveryDate;

    // Define columns for items table starting from a specific row
    worksheet.columns = [
      { width: 15 },
      { width: 23 },
      { width: 20 },
      { width: 20 },
      { width: 10 },
      { width: 15 },
      { width: 15 },
    ];

    const headerRow = 10;
    worksheet.getRow(headerRow).values = [null, 'Article', 'Nombre de pièces', 'Pièces par kg', 'Prix du kg', 'Poid total article', 'Prix total article'];
    worksheet.getRow(headerRow).font = { bold: true };

    // Start adding items from row after the header
    let rowIndex = headerRow + 1;
    const itemsRef = orderRef.collection('items');
    const itemsSnapshot = await itemsRef.get();

    for (const doc of itemsSnapshot.docs) {
      const item = doc.data();
      const row = worksheet.getRow(rowIndex);
      row.getCell(2).value = item.product_name;
      row.getCell(3).value = parseInt(item.number_of_pieces);
      row.getCell(4).value = parseInt(item.pieces_per_kilo);
      row.getCell(5).value = item.price;
      row.getCell(6).value = item.weight;
      row.getCell(7).value = item.total_price;

      // Download and embed item image
      if (item.picture_url) {
        const imageBuffer = await downloadImageFromGCS(item.picture_url);
        const imageId = workbook.addImage({
          buffer: imageBuffer,
          extension: 'jpeg',
        });
        worksheet.addImage(imageId, {
          tl: { col: 0.9, row: rowIndex - 1 + 0.5},
          ext: { width: 50, height: 50 }
        });
        worksheet.getRow(row.number).height = 50*1.2;
      }

      rowIndex++;
    }

    const totalWeight = rowIndex + 2;
    worksheet.getCell(`B${totalWeight}`).value = `Poid Total:`;
    worksheet.getCell(`B${totalWeight}`).font = { bold: true };
    worksheet.getCell(`C${totalWeight}`).value = orderData.total_number_of_pieces;

    const totalPieces = rowIndex + 3;
    worksheet.getCell(`B${totalPieces}`).value = `Nombre de pièces total:`;
    worksheet.getCell(`B${totalPieces}`).font = { bold: true };
    worksheet.getCell(`C${totalPieces}`).value = orderData.total_number_of_pieces;

    // Add Order Total Price at the end
    const totalPriceRow = rowIndex + 4;
    worksheet.getCell(`B${totalPriceRow}`).value = `Prix total de la commande:`;
    worksheet.getCell(`B${totalPriceRow}`).font = { bold: true };
    worksheet.getCell(`C${totalPriceRow}`).value = orderData.total_price;

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
  exportOrder,
  computeOrderGlobals,
  getOrderItem,
  getOrderItems
};
// http://localhost:3000/export-order/bfyQjiV29KfGDVg7q4sh