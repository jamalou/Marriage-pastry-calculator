const { Storage } = require('@google-cloud/storage');


const storage = new Storage();
const bucket = storage.bucket('demo_mohamed_jamel'); // Replace with your bucket name

module.exports = bucket;