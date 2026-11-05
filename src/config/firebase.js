const admin = require('firebase-admin');

// Validação segura da chave de serviço do Firebase
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
} catch (e) {
  console.error('Erro ao parsear FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
}

// Inicializa o Firebase Admin se ainda não foi inicializado
if (!admin.apps.length && serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

// Instâncias do Firestore e Storage com privilégios totais
const db = admin.apps.length ? admin.firestore() : null;
const bucket = admin.apps.length ? admin.storage().bucket() : null;

module.exports = { admin, db, bucket };