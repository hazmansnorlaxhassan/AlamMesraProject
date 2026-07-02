const crypto = require('crypto');
const fs = require('fs');

const hash1 = crypto.createHash('sha256').update('superadmin').digest('hex');
const hash2 = crypto.createHash('sha256').update('superadmin123').digest('hex');

fs.writeFileSync('hash-output.txt', `superadmin: ${hash1}\nsuperadmin123: ${hash2}`);
