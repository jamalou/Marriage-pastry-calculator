const db = require('./firestore');

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

module.exports = {
    createOrder,
    getAllOrders,
    getOrderById,
    updateOrder
};