const db = require('./firestore');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

function importProducts(filePath) {
  return new Promise((resolve, reject) => {
    const products = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => products.push(data))
      .on('end', async () => {
        try {
          const batch = db.batch();
          products.forEach(product => {
            const docRef = db.collection('products').doc(); // Create a new document for each product
            batch.set(docRef, product);
          });
          await batch.commit();
          resolve(products.length);
        } catch (error) {
          reject(error);
        }
      });
  });
}

module.exports = importProducts;
