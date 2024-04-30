const db = require('./firestore');

// Helper function to fetch product details
async function fetchProductDetails(productName) {
    const productRef = db.collection('products').where('product_name', '==', productName).limit(1);
    const snapshot = await productRef.get();
    if (snapshot.empty) {
        throw new Error('Product not found');
    }
    return snapshot.docs[0].data(); // Assuming the product exists and is unique
}

// Add an item to an order
async function addItemToOrder(orderId, itemData) {
    const orderRef = db.collection('orders').doc(orderId);
    const itemRef = orderRef.collection('items').doc(); // Create a new document for the item

    const productDetails = await fetchProductDetails(itemData.product_name);
    if (itemData.number_of_pieces) {
        itemData.weight = itemData.number_of_pieces / productDetails.pieces_per_kilo;
    }

    itemData.total_price = itemData.weight * productDetails.price_per_kilo;

    await itemRef.set(itemData);
    return itemRef.id;
}

// Update an item in an order
async function updateItemInOrder(orderId, itemId, itemData) {
    const itemRef = db.collection('orders').doc(orderId).collection('items').doc(itemId);

    const productDetails = await fetchProductDetails(itemData.product_name);
    if (itemData.number_of_pieces) {
        itemData.weight = itemData.number_of_pieces / productDetails.pieces_per_kilo;
    }

    itemData.total_price = itemData.weight * productDetails.price_per_kilo;

    await itemRef.update(itemData);
    return itemId;
}

// Delete an item from an order
async function deleteItemFromOrder(orderId, itemId) {
    const itemRef = db.collection('orders').doc(orderId).collection('items').doc(itemId);
    await itemRef.delete();
    return itemId;
}

module.exports = {
    addItemToOrder,
    updateItemInOrder,
    deleteItemFromOrder
};
