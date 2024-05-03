const { Storage } = require('@google-cloud/storage');


const storage = new Storage();

bucketName = 'demo_mohamed_jamel';
const bucket = storage.bucket(bucketName);

async function uploadFileToGCS(file) {
    const fileName = `data/product/imports/${Date.now()}-${file.originalname}`;
    const fileUpload = bucket.file(fileName);
  
    const stream = await fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype
      }
    });
  
    stream.on('error', (e) => {
      throw new Error('Something went wrong!');
    });
  
    stream.end(file.buffer);
    return `https://storage.googleapis.com/${bucketName}/${fileName}`;
  }

module.exports = {
    bucket,
    uploadFileToGCS
};
