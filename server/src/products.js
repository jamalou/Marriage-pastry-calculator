const db = require('./firestore');
const { Storage } = require('@google-cloud/storage');
const csv = require('csv-parser');
const Excel = require('exceljs');


const storage = new Storage();

async function getAllProducts() {
  const productsRef = db.collection('products');
  const snapshot = await productsRef.get();
  const products = [];
  snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
  });
  return products
}
async function clearCollection(collectionPath) {
  const dbRef = db.collection(collectionPath);
  const batchSize = 200; // Firestore limit is 500 operations in a batch
  const query = dbRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });

  async function deleteQueryBatch(query, resolve) {
    const snapshot = await query.get();

    // When there are no documents left, we are done
    if (snapshot.size === 0) {
      resolve();
      return;
    }

    // Delete documents in a batch
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();

    // Recurse on the next process tick, to avoid
    // exploding the stack.
    process.nextTick(() => {
      deleteQueryBatch(query, resolve);
    });
  }
}

async function importProducts(fileUrl) {
  const match = fileUrl.match(/https:\/\/storage\..+\.com\/([^\/]+)\/(.+)/);
  if (!match) {
    throw new Error('Invalid URL');
  }

  const bucketName = match[1];
  const fileName = match[2];
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  try {
    return new Promise(async (resolve, reject) => {

      // First clear the existing products
      await clearCollection('products');
      console.log(`Downloading file from GCS bucket: ${bucketName}, file: ${fileName}`);
      const products = [];
      file.createReadStream()
        .pipe(csv())
        .on('data', (data) => products.push(data))
        .on('error', (error) => reject(error))
        .on('end', async () => {
          try {
            const batch = db.batch();
            products.forEach(product => {
              const docRef = db.collection('products').doc(); // Create a new document for each product
              batch.set(docRef, product);
            });
            await batch.commit();
            resolve(await getAllProducts());
          } catch (error) {
            reject(error);
          }
        });
    });
  } catch (error) {
    throw new Error(`Failed to clear the collection or import products: ${error.message}`);
  }
}

const addProduct = async (req, res) => {
  const newProduct = req.body;
  try {
      // Add a new document with a generated ID
      const docRef = await db.collection('products').add(newProduct);
      res.status(201).send({ status: 'Success', message: 'Product added successfully', product: {id: docRef.id, ...newProduct} });
  } catch (error) {
      res.status(500).send({ status: 'Error', message: error.message });
  }
};

const listProducts = async (req, res) => {
    try {
        const productsList = await getAllProducts()
        res.status(200).send(productsList);
    } catch (error) {
        res.status(500).send({ status: 'Error', message: error.message });
    }
};

const updateProduct = async (req, res) => {
    const productId = req.params.productId;
    const updates = req.body;
    try {
        await db.collection('products').doc(productId).update(updates);
        res.status(200).send({ status: 'Success', message: 'Product updated successfully', id: productId });
    } catch (error) {
        res.status(500).send({ status: 'Error', message: error.message });
    }
};

// Function to delete a product by ID
async function deleteProduct(productId) {
  const productRef = db.collection('products').doc(productId);

  // Check if the product actually exists
  const doc = await productRef.get();
  if (!doc.exists) {
      throw new Error('Product not found');
  }

  // If the product exists, delete it
  await productRef.delete();
  return { message: `Product with ID ${productId} deleted successfully.`, id: productId };
}

// Helper function to download image
async function downloadImageFromGCS(gcsUrl) {
  // Parse the GCS URL to extract the bucket name and file path
  const urlPattern = /^https:\/\/storage\..+\.com\/([^\/]+)\/(.+)$/;
  const match = gcsUrl.match(urlPattern);

  if (!match) {
    throw new Error("Invalid GCS URL");
  }

  const bucketName = match[1];
  const fileName = match[2];
  console.log(`Downloading image from GCS bucket: ${bucketName}, file: ${fileName}`); 

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  try {
    // Downloads the file into a buffer.
    const [buffer] = await file.download();
    console.log('Image downloaded successfully. ' + buffer.length + ' bytes read.')
    return buffer;
  } catch (error) {
    console.error('Failed to download image:', error);
    throw error; // Rethrow to handle it according to your error handling policy
  }
}

const exportProducts = async (req, res) => {
  try {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    worksheet.columns = [
      { header: 'Image', key: 'image', width: 15 },
      { header: 'Product Name', key: 'product_name', width: 30 },
      { header: 'Category', key: 'product_category', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Pieces per Kilo', key: 'pieces_per_kilo', width: 15 },
      { header: 'Price', key: 'price', width: 10 }
    ];

    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();

    await Promise.all(snapshot.docs.map(async doc => {
      const data = doc.data();
      const row = worksheet.addRow({
        product_name: data.product_name,
        product_category: data.product_category,
        status: data.status,
        pieces_per_kilo: data.pieces_per_kilo,
        price: data.price
      });

      if (data.picture_url) {
        try {
          const imageBuffer = await downloadImageFromGCS(data.picture_url);
          const imageId = workbook.addImage({
            buffer: imageBuffer,
            extension: 'jpeg',
          });

          // Define the size and position of the image
          const imageHeight = 50; // Height in pixels
          const imageWidth = 50; // Width in pixels

          worksheet.addImage(imageId, {
            tl: { col: 0.9, row: row.number - 1 + 0.5 },
            ext: { width: imageWidth, height: imageHeight }
          });

          // Adjust row height to match the image height
          // Excel row height is not in pixels, and the exact conversion factor can vary, but approx. 0.75 works for many cases
          worksheet.getRow(row.number).height = imageHeight*1.2;

        } catch (error) {
          console.error(`Failed to download or embed image for product ${data.product_name}: ${error.message}`);
        }
      }
    }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="products.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Failed to create Excel file:', error);
    res.status(500).send({ error: 'Failed to export products to Excel', detail: error.message });
  }
};

async function searchProducts(query) {
  const productsRef = db.collection('products');
  const snapshot = await productsRef.get(); // Get all products
  const products = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.product_name && data.product_name.toLowerCase().includes(query.toLowerCase())) {
      // Include the document ID with the product's data
      products.push({
        id: doc.id,  // This is how you get the document's ID
        ...data     // Spread operator to include all data fields of the document
      });
    }
  });

  return products;
}


module.exports = {
    importProducts,
    addProduct,
    listProducts,
    updateProduct,
    exportProducts,
    downloadImageFromGCS,
    searchProducts,
    deleteProduct
};
