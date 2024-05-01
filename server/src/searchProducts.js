const db = require('./firestore');

async function searchProducts(query) {
  const productsRef = db.collection('products');
  const snapshot = await productsRef.get(); // Get all products or modify to retrieve a smaller set
  const products = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.product_name && data.product_name.toLowerCase().includes(query.toLowerCase())) {
      products.push(data);
    }
  });

  return products;
}

module.exports = searchProducts;
