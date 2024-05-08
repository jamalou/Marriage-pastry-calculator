const db = require('./firestore');
const { computeOrderGlobals } = require('./order');

// Fetch product details using the productId
async function fetchProductDetails(productId) {
    const productRef = db.collection('products').doc(productId);
    const doc = await productRef.get();

    if (!doc.exists) {
        console.log('No such product!');
        return null; // Or handle this as an error as appropriate
    } else {
        return doc.data(); // Return the product details
    }
}

// Add an item to an order
async function addItemToOrder(orderId, itemData) {
    const orderRef = db.collection('orders').doc(orderId);

    const itemRef = orderRef.collection('items').doc(); // Create a new document for the item
    const productDetails = await fetchProductDetails(itemData.product_id);
    
    // Check if productDetails and required properties are available and valid
    if (
        !productDetails
        || isNaN(parseInt(productDetails.product_piece_per_kilo))
        || isNaN(parseFloat(productDetails.product_price))
    ) {
        console.error('Invalid product details');
        if (!productDetails) {
            throw new Error('Product not found');
        } else if (isNaN(parseInt(productDetails.product_piece_per_kilo))) {
            throw new Error('Invalid pieces per kilo');
        } else if (isNaN(parseFloat(productDetails.product_price))) {
            throw new Error('Invalid price');
        }
    }

    itemData.product_piece_per_kilo = productDetails.product_piece_per_kilo;
    itemData.product_price = productDetails.product_price;
    itemData.product_image_url = productDetails.product_image_url;
    itemData.product_name = productDetails.product_name;
    itemData.created_at = new Date().toISOString();
    itemData.updated_at = new Date().toISOString();

    if (itemData.total_number_pieces && !isNaN(itemData.total_number_pieces)) {
        const numPieces = parseInt(itemData.total_number_pieces);
        pieces_per_kilo = parseInt(productDetails.product_piece_per_kilo);
        if (pieces_per_kilo > 0) {
            const calculatedWeight = numPieces / pieces_per_kilo;
            itemData.total_weight = parseFloat(calculatedWeight.toFixed(2)); // Round weight to 2 decimal places
        } else {
            console.error('Number of pieces not provided or invalid');
            throw new Error('Invalid number of pieces');
        }
    } else {
        const weight = parseFloat(itemData.total_weight);
        if (!isNaN(weight) && weight > 0) {
            itemData.total_number_pieces = Math.round(weight * parseInt(itemData.product_piece_per_kilo));
            itemData.total_weight = weight;
        } else {
            console.error('Weight is not provided or invalid');
            throw new Error('Weight is not provided or invalid');
        }
    }
    // Ensure that weight is calculated and valid before using it to calculate total price
    if (itemData.total_weight && !isNaN(itemData.total_weight)) {
        total_price = itemData.total_weight * parseFloat(productDetails.product_price);
        itemData.total_price = parseFloat(total_price.toFixed(2)); // Round total price to 2 decimal places
    } else {
        console.error('Weight calculation failed');
        throw new Error('Invalid weight calculation');
    }

    await itemRef.set(itemData);

    // Update the order total price
    await computeOrderGlobals(orderId);

    return {id: itemRef.id, ...itemData};
}

// Update an item in an order
async function updateItemInOrder(orderId, itemId, updateData) {
    const orderRef = db.collection('orders').doc(orderId);
    const itemRef = orderRef.collection('items').doc(itemId);
    if (!orderRef) {
        throw new Error("Invalid order ID");
    }
    if (!itemRef) {
        throw new Error("Invalid item ID");
    }

    try {
        // Get the current item data
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists) {
            throw new Error('Item not found');
        }
        const itemData = itemDoc.data();

        // Check if weight is provided and update total_number_pieces
        if ('total_weight' in updateData && updateData.total_weight !== undefined) {
            const total_weight = parseFloat(updateData.total_weight);
            if (isNaN(total_weight) || total_weight <= 0) {
                throw new Error('Invalid total_weight provided');
            }
            const piecesPerKilo = parseInt(itemData.product_piece_per_kilo);
            updateData.total_number_pieces = Math.round(total_weight * piecesPerKilo);
        }
        // Otherwise, if total_number_pieces is provided, update weight
        else if ('total_number_pieces' in updateData && updateData.total_number_pieces !== undefined) {
            const numPieces = parseInt(updateData.total_number_pieces);
            if (isNaN(numPieces) || numPieces <= 0) {
                throw new Error('Invalid number of pieces provided');
            }
            const piecesPerKilo = parseInt(itemData.product_piece_per_kilo);
            if (piecesPerKilo <= 0) {
                throw new Error('Invalid pieces per kilo in item data');
            }
            updateData.total_weight = parseFloat((numPieces / piecesPerKilo).toFixed(2));
        } else {
            throw new Error('Neither weight nor number of pieces provided');
        }

        // Calculate the total price based on the updated weight
        updateData.total_price = parseFloat((updateData.total_weight * parseFloat(itemData.product_price)).toFixed(2));

        // Update the item in Firestore
        await itemRef.update(updateData);
        console.log('Item updated successfully:', itemId);

        // Update the order total price
        await computeOrderGlobals(orderId);
        
    } catch (error) {
        console.error('Failed to update item:', error);
        throw error; // Re-throw to handle it in the calling context if necessary
    }
}

// Delete an item from an order
async function deleteItemFromOrder(orderId, itemId) {
    const itemRef = db.collection('orders').doc(orderId).collection('items').doc(itemId);
    await itemRef.delete();
    await computeOrderGlobals(orderId);
    return itemId;
}

module.exports = {
    addItemToOrder,
    updateItemInOrder,
    deleteItemFromOrder
};
