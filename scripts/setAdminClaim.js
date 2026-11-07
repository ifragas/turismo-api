// Script temporário para atribuir role admin ao usuário. Executar UMA VEZ e depois apagar.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ALLOWED_ROLES = ['admin', 'editor'];

function parseArgs(argv) {
  const args = {};

  for (const token of argv.slice(2)) {
    const match = token.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }

  return args;
}

function loadServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (rawJson && rawJson.trim()) {
    try {
      return JSON.parse(rawJson);
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON inválido: ${error.message}`);
    }
  }

  if (filePath && filePath.trim()) {
    const resolved = path.resolve(filePath);

    if (!fs.existsSync(resolved)) {
      throw new Error(`Arquivo de credenciais não encontrado: ${resolved}`);
    }

    try {
      return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } catch (error) {
      throw new Error(`Não foi possível ler FIREBASE_SERVICE_ACCOUNT_PATH: ${error.message}`);
    }
  }

  throw new Error(
    'Credenciais ausentes. Defina FIREBASE_SERVICE_ACCOUNT_JSON ou FIREBASE_SERVICE_ACCOUNT_PATH no .env.'
  );
}

async function main() {
  const { uid, role, tenant } = parseArgs(process.argv);

  if (!uid) {
    throw new Error('Parâmetro obrigatório ausente: --uid=');
  }

  if (!role) {
    throw new Error('Parâmetro obrigatório ausente: --role=');
  }

  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error(
      `Role inválida "${role}". Valores permitidos: ${ALLOWED_ROLES.join(', ')}.`
    );
  }

  if (!tenant) {
    throw new Error('Parâmetro obrigatório ausente: --tenant=');
  }

  const serviceAccount = loadServiceAccount();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  try {
    await admin.auth().getUser(uid);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw new Error(`Usuário não encontrado no Firebase Auth: ${uid}`);
    }
    throw error;
  }

  await admin.auth().setCustomUserClaims(uid, { role, tenant });

  console.log('Custom claims atribuídas com sucesso.');
  console.log(`uid: ${uid}`);
  console.log(`role: ${role}`);
  console.log(`tenant: ${tenant}`);
  console.log('');
  console.log('O usuário precisa sair e entrar novamente no painel para o token refletir as novas claims.');
}

main().catch((error) => {
  console.error('Erro ao atribuir custom claims:', error.message || error);
  process.exit(1);
});
