const multer = require('multer');
const sharp = require('sharp');

const db = require('./firestore');
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();

bucketName = 'demo_mohamed_jamel';
const bucket = storage.bucket(bucketName);

// Configure multer for memory storage (to process the file in memory)
const multerStorage = multer.memoryStorage();
const upload = multer({
  storage: multerStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

const uploadImage = upload.single('image');

const processImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: 'No image uploaded' });
  }

  const productId = req.params.productId; // Get product ID from URL

  // Define imageBuffer here within the try block to ensure its scope includes its usage
  try {
    // Process the image and generate a buffer
    const imageBuffer = await sharp(req.file.buffer)
      .resize(120, null) // Resize width to 640px and adjust height to maintain aspect ratio
      .toBuffer();

    const productRef = db.collection('products').doc(productId);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return res.status(404).send({ message: 'Product not found' });
    }

    const productData = productDoc.data();
    const filename = `${productData.product_name.replace(/ /g, '_')}.jpeg`; // Use product name for filename
    const filePath = `data/product/images/${filename}`;

    const file = bucket.file(filePath);
    await file.save(imageBuffer, {
      metadata: { contentType: 'image/jpeg' }
    });

    const url = `https://storage.cloud.google.com/${bucket.name}/${filePath}`;

    // Update Firestore with the new image URL
    await productRef.update({ product_image_url: url });

    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    const products = [];
    snapshot.forEach(doc => {
        products.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).send({ message: 'Image uploaded successfully', url , products: products});
  } catch (error) {
    res.status(500).send({ message: 'Failed to upload image to Google Cloud Storage', error: error.message });
  }
};

module.exports = { uploadImage, processImage };