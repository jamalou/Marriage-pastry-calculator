const db = require('./firestore');
const { getOrderPrice } = require('./order');

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
    itemData.pieces_per_kilo = productDetails.pieces_per_kilo;
    itemData.price = productDetails.price;
    itemData.picture_url = productDetails.picture_url;
    // Check if productDetails and required properties are available and valid
    if (
        !productDetails
        || isNaN(parseInt(productDetails.pieces_per_kilo)) 
        || isNaN(parseFloat(productDetails.price))
    ) {
        console.error('Invalid product details');
        if (!productDetails) {
            throw new Error('Product not found');
        } else if (isNaN(parseInt(productDetails.pieces_per_kilo))) {
            throw new Error('Invalid pieces per kilo');
        } else if (isNaN(parseFloat(productDetails.price))) {
            throw new Error('Invalid price');
        }
    }

    if (itemData.number_of_pieces && !isNaN(itemData.number_of_pieces)) {
        const numPieces = parseInt(itemData.number_of_pieces);
        pieces_per_kilo = parseInt(productDetails.pieces_per_kilo);
        if (pieces_per_kilo > 0) {
            const calculatedWeight = numPieces / pieces_per_kilo;
            itemData.weight = parseFloat(calculatedWeight.toFixed(2)); // Round weight to 2 decimal places
        } else {
            console.error('Number of pieces not provided or invalid');
            throw new Error('Invalid number of pieces');
        }
    } else {
        const weight = parseFloat(itemData.weight);
        if (!isNaN(weight) && weight > 0) {
            itemData.number_of_pieces = Math.round(weight * parseInt(itemData.pieces_per_kilo));
            itemData.weight = weight;
        } else {
            console.error('Weight is not provided or invalid');
            throw new Error('Weight is not provided or invalid');
        }
    }
    // Ensure that weight is calculated and valid before using it to calculate total price
    if (itemData.weight && !isNaN(itemData.weight)) {
        total_price = itemData.weight * parseFloat(productDetails.price);
        itemData.total_price = parseFloat(total_price.toFixed(2)); // Round total price to 2 decimal places
    } else {
        console.error('Weight calculation failed');
        throw new Error('Invalid weight calculation');
    }

    await itemRef.set(itemData);

    // Update the order total price
    await getOrderPrice(orderId);

    return itemRef.id;
}

// Update an item in an order
async function updateItemInOrder(orderId, itemId, updateData) {
    const orderRef = db.collection('orders').doc(orderId);
    const itemRef = orderRef.collection('items').doc(itemId);

    try {
        // Get the current item data
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists) {
            throw new Error('Item not found');
        }
        const itemData = itemDoc.data();

        // Check if weight is provided and update number_of_pieces
        if ('weight' in updateData && updateData.weight !== undefined) {
            const weight = parseFloat(updateData.weight);
            if (isNaN(weight) || weight <= 0) {
                throw new Error('Invalid weight provided');
            }
            const piecesPerKilo = parseInt(itemData.pieces_per_kilo);
            updateData.number_of_pieces = Math.round(weight * piecesPerKilo);
        }
        // Otherwise, if number_of_pieces is provided, update weight
        else if ('number_of_pieces' in updateData && updateData.number_of_pieces !== undefined) {
            const numPieces = parseInt(updateData.number_of_pieces);
            if (isNaN(numPieces) || numPieces <= 0) {
                throw new Error('Invalid number of pieces provided');
            }
            const piecesPerKilo = parseInt(itemData.pieces_per_kilo);
            if (piecesPerKilo <= 0) {
                throw new Error('Invalid pieces per kilo in item data');
            }
            updateData.weight = parseFloat((numPieces / piecesPerKilo).toFixed(2));
        } else {
            throw new Error('Neither weight nor number of pieces provided');
        }

        // Calculate the total price based on the updated weight
        updateData.total_price = parseFloat((updateData.weight * parseFloat(itemData.price)).toFixed(2));

        // Update the item in Firestore
        await itemRef.update(updateData);
        console.log('Item updated successfully:', itemId);

        // Update the order total price
        await getOrderPrice(orderId);
        
    } catch (error) {
        console.error('Failed to update item:', error);
        throw error; // Re-throw to handle it in the calling context if necessary
    }
}

// Delete an item from an order
async function deleteItemFromOrder(orderId, itemId) {
    const itemRef = db.collection('orders').doc(orderId).collection('items').doc(itemId);
    await itemRef.delete();
    await getOrderPrice(orderId);
    return itemId;
}

module.exports = {
    addItemToOrder,
    updateItemInOrder,
    deleteItemFromOrder
};
