// server.js
const express = require('express');
const cors = require('cors');
const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, doc, deleteDoc, updateDoc, getDoc } = require('firebase/firestore');
require('dotenv').config(); // ✅ Carrega as variáveis de ambiente

// 🔥 Firebase Admin SDK (para excluir do Storage)
const admin = require('firebase-admin');
// ✅ Lê o JSON das variáveis de ambiente
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Configuração do Firebase (com variáveis de ambiente)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Inicializa o Firebase Client (para GET/POST)
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();

// Inicializa o Firebase Admin (para excluir do Storage)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount), // ✅ Usando certificado
    storageBucket: "turismo-app-fa581.firebasestorage.app"
  });
}

const bucket = admin.storage().bucket();

// Função para extrair caminho da URL do Storage
const extractFilePath = (url) => {
  if (!url) return null;

  // Exemplo de URL:
  // https://firebasestorage.googleapis.com/v0/b/turismo-app-fa581.firebasestorage.app/o/imagens%2Facomodacoes%2F1755921099981_Imagem_do_WhatsApp_de_2025_08_12_a_s_10.13.16_6460acd6.jpg?alt=media&token=...

  const regex = /o\/(.+?)\?/;
  const match = url.match(regex);
  return match ? decodeURIComponent(match[1]) : null;
};

// Função para limpar URLs
const cleanUrls = (urls) => {
  if (!Array.isArray(urls)) return [];
  return urls
    .map(url => url?.trim())
    .filter(url => url && url.startsWith('http'));
};

// Rota raiz (/)
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 API do Guia da Cidade</h1>
    <p>Esta é a API REST do app de turismo da sua cidade.</p>
    <h2>🔗 Endpoints disponíveis:</h2>
    <ul>
      <li><a href="/api/pontos-turisticos">GET /api/pontos-turisticos</a></li>
      <li>POST /api/pontos-turisticos</li>
      <li>PUT /api/pontos-turisticos/:id</li>
      <li>DELETE /api/pontos-turisticos/:id</li>
      <li><a href="/api/restaurantes">GET /api/restaurantes</a></li>
      <li>POST /api/restaurantes</li>
      <li>PUT /api/restaurantes/:id</li>
      <li>DELETE /api/restaurantes/:id</li>
      <li><a href="/api/acomodacoes">GET /api/acomodacoes</a></li>
      <li>POST /api/acomodacoes</li>
      <li>PUT /api/acomodacoes/:id</li>
      <li>DELETE /api/acomodacoes/:id</li>
    </ul>
    <p>📅 Criado em 2025</p>
  `);
});

// Rota de teste
app.get('/api', (req, res) => {
  res.json({ message: 'API do Guia da Cidade está online!' });
});

// ========================
// PONTOS TURÍSTICOS
// ========================

// GET /pontos-turisticos
app.get('/api/pontos-turisticos', async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, 'pontosTuristicos'));
    const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(lista);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar pontos turísticos' });
  }
});

// POST /pontos-turisticos
app.post('/api/pontos-turisticos', async (req, res) => {
  try {
    const { nome, descricao, endereco, horario, imagem, imagens, latitude, longitude } = req.body;

    if (!nome || !descricao) {
      return res.status(400).json({
        error: 'Campos obrigatórios: nome e descrição'
      });
    }

    const docRef = await addDoc(collection(db, 'pontosTuristicos'), {
      nome,
      descricao,
      endereco: endereco || '',
      horario: horario || '',
      imagem: imagem?.trim() || '',
      imagens: cleanUrls(imagens),
      tipo: 'Ponto Turístico',
      latitude: latitude || null,
      longitude: longitude || null,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      id: docRef.id,
      nome,
      descricao,
      endereco,
      horario,
      imagem,
      imagens: cleanUrls(imagens),
      tipo: 'Ponto Turístico',
      latitude,
      longitude
    });
  } catch (error) {
    console.error('Erro ao cadastrar ponto turístico:', error);
    res.status(500).json({ error: 'Erro ao cadastrar ponto turístico' });
  }
});

// PUT /pontos-turisticos/:id
app.put('/api/pontos-turisticos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, endereco, horario, imagem, imagens, latitude, longitude } = req.body;

    if (!nome || !descricao) {
      return res.status(400).json({
        error: 'Campos obrigatórios: nome e descrição'
      });
    }

    const docRef = doc(db, 'pontosTuristicos', id);
    await updateDoc(docRef, {
      nome,
      descricao,
      endereco: endereco || '',
      horario: horario || '',
      imagem: imagem?.trim() || '',
      imagens: cleanUrls(imagens),
      tipo: 'Ponto Turístico',
      latitude: latitude || null,
      longitude: longitude || null,
      updatedAt: new Date().toISOString()
    });

    res.status(200).json({
      id,
      nome,
      descricao,
      endereco,
      horario,
      imagem,
      imagens: cleanUrls(imagens),
      tipo: 'Ponto Turístico',
      latitude,
      longitude
    });
  } catch (error) {
    console.error('Erro ao atualizar ponto turístico:', error);
    res.status(500).json({ error: 'Erro ao atualizar ponto turístico' });
  }
});

// DELETE /pontos-turisticos/:id
app.delete('/api/pontos-turisticos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }

    // 1. Busca o documento antes de excluir
    const docRef = doc(db, 'pontosTuristicos', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const dados = docSnap.data();

    // 2. Exclui as imagens do Storage
    if (Array.isArray(dados.imagens)) {
      for (const url of dados.imagens) {
        const filePath = extractFilePath(url);
        if (filePath) {
          try {
            await bucket.file(filePath).delete();
            console.log('✅ Imagem excluída do Storage:', filePath);
          } catch (error) {
            console.warn('⚠️ Erro ao excluir imagem:', filePath, error.message);
          }
        }
      }
    }

    // 3. Exclui o documento do Firestore
    await deleteDoc(docRef);

    res.status(200).json({ message: 'Ponto turístico excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir ponto turístico:', error);
    res.status(500).json({ error: 'Erro ao excluir ponto turístico' });
  }
});

// ========================
// RESTAURANTES
// ========================

// GET /restaurantes
app.get('/api/restaurantes', async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, 'restaurantes'));
    const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(lista);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar restaurantes' });
  }
});

// POST /restaurantes
app.post('/api/restaurantes', async (req, res) => {
  try {
    const { nome, descricao, endereco, horario, imagem, imagens, latitude, longitude } = req.body;

    if (!nome || !descricao) {
      return res.status(400).json({
        error: 'Campos obrigatórios: nome e descrição'
      });
    }

    const docRef = await addDoc(collection(db, 'restaurantes'), {
      nome,
      descricao,
      endereco: endereco || '',
      horario: horario || '',
      imagem: imagem?.trim() || '',
      imagens: cleanUrls(imagens),
      tipo: 'Restaurante',
      latitude: latitude || null,
      longitude: longitude || null,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      id: docRef.id,
      nome,
      descricao,
      endereco,
      horario,
      imagem,
      imagens: cleanUrls(imagens),
      tipo: 'Restaurante',
      latitude,
      longitude
    });
  } catch (error) {
    console.error('Erro ao cadastrar restaurante:', error);
    res.status(500).json({ error: 'Erro ao cadastrar restaurante' });
  }
});

// PUT /restaurantes/:id
app.put('/api/restaurantes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, endereco, horario, imagem, imagens, latitude, longitude } = req.body;

    if (!nome || !descricao) {
      return res.status(400).json({
        error: 'Campos obrigatórios: nome e descrição'
      });
    }

    const docRef = doc(db, 'restaurantes', id);
    await updateDoc(docRef, {
      nome,
      descricao,
      endereco: endereco || '',
      horario: horario || '',
      imagem: imagem?.trim() || '',
      imagens: cleanUrls(imagens),
      tipo: 'Restaurante',
      latitude: latitude || null,
      longitude: longitude || null,
      updatedAt: new Date().toISOString()
    });

    res.status(200).json({
      id,
      nome,
      descricao,
      endereco,
      horario,
      imagem,
      imagens: cleanUrls(imagens),
      tipo: 'Restaurante',
      latitude,
      longitude
    });
  } catch (error) {
    console.error('Erro ao atualizar restaurante:', error);
    res.status(500).json({ error: 'Erro ao atualizar restaurante' });
  }
});

// DELETE /restaurantes/:id
app.delete('/api/restaurantes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }

    // 1. Busca o documento antes de excluir
    const docRef = doc(db, 'restaurantes', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const dados = docSnap.data();

    // 2. Exclui as imagens do Storage
    if (Array.isArray(dados.imagens)) {
      for (const url of dados.imagens) {
        const filePath = extractFilePath(url);
        if (filePath) {
          try {
            await bucket.file(filePath).delete();
            console.log('✅ Imagem excluída do Storage:', filePath);
          } catch (error) {
            console.warn('⚠️ Erro ao excluir imagem:', filePath, error.message);
          }
        }
      }
    }

    // 3. Exclui o documento do Firestore
    await deleteDoc(docRef);

    res.status(200).json({ message: 'Restaurante excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir restaurante:', error);
    res.status(500).json({ error: 'Erro ao excluir restaurante' });
  }
});

// ========================
// ACOMODAÇÕES
// ========================

// GET /acomodacoes
app.get('/api/acomodacoes', async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, 'acomodacoes'));
    const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(lista);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar acomodações' });
  }
});

// POST /acomodacoes
app.post('/api/acomodacoes', async (req, res) => {
  try {
    const { nome, descricao, endereco, horario, imagem, imagens, latitude, longitude } = req.body;

    if (!nome || !descricao) {
      return res.status(400).json({
        error: 'Campos obrigatórios: nome e descrição'
      });
    }

    const docRef = await addDoc(collection(db, 'acomodacoes'), {
      nome,
      descricao,
      endereco: endereco || '',
      horario: horario || '',
      imagem: imagem?.trim() || '',
      imagens: cleanUrls(imagens),
      tipo: 'Acomodação',
      latitude: latitude || null,
      longitude: longitude || null,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      id: docRef.id,
      nome,
      descricao,
      endereco,
      horario,
      imagem,
      imagens: cleanUrls(imagens),
      tipo: 'Acomodação',
      latitude,
      longitude
    });
  } catch (error) {
    console.error('Erro ao cadastrar acomodação:', error);
    res.status(500).json({ error: 'Erro ao cadastrar acomodação' });
  }
});

// PUT /acomodacoes/:id
app.put('/api/acomodacoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, endereco, horario, imagem, imagens, latitude, longitude } = req.body;

    if (!nome || !descricao) {
      return res.status(400).json({
        error: 'Campos obrigatórios: nome e descrição'
      });
    }

    const docRef = doc(db, 'acomodacoes', id);
    await updateDoc(docRef, {
      nome,
      descricao,
      endereco: endereco || '',
      horario: horario || '',
      imagem: imagem?.trim() || '',
      imagens: cleanUrls(imagens),
      tipo: 'Acomodação',
      latitude: latitude || null,
      longitude: longitude || null,
      updatedAt: new Date().toISOString()
    });

    res.status(200).json({
      id,
      nome,
      descricao,
      endereco,
      horario,
      imagem,
      imagens: cleanUrls(imagens),
      tipo: 'Acomodação',
      latitude,
      longitude
    });
  } catch (error) {
    console.error('Erro ao atualizar acomodação:', error);
    res.status(500).json({ error: 'Erro ao atualizar acomodação' });
  }
});

// DELETE /acomodacoes/:id
app.delete('/api/acomodacoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }

    // 1. Busca o documento antes de excluir
    const docRef = doc(db, 'acomodacoes', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const dados = docSnap.data();

    // 2. Exclui as imagens do Storage
    if (Array.isArray(dados.imagens)) {
      for (const url of dados.imagens) {
        const filePath = extractFilePath(url);
        if (filePath) {
          try {
            await bucket.file(filePath).delete();
            console.log('✅ Imagem excluída do Storage:', filePath);
          } catch (error) {
            console.warn('⚠️ Erro ao excluir imagem:', filePath, error.message);
          }
        }
      }
    }

    // 3. Exclui o documento do Firestore
    await deleteDoc(docRef);

    res.status(200).json({ message: 'Acomodação excluída com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir acomodação:', error);
    res.status(500).json({ error: 'Erro ao excluir acomodação' });
  }
});

// POST /api/excluir-imagem
app.post('/api/excluir-imagem', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: '.filePath é obrigatório' });
    }

    // ✅ Exclui do Storage
    await bucket.file(filePath).delete();

    res.status(200).json({ message: 'Imagem excluída com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir imagem:', error);
    res.status(500).json({ error: 'Erro ao excluir imagem do Storage' });
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ Valida campos obrigatórios
    if (!email || !password) {
      return res.status(400).json({
        error: 'Campos obrigatórios: e-mail e senha'
      });
    }

    // ✅ Valida credenciais (exemplo simples)
    const ADMIN_EMAIL = 'admin@cidade.com';
    const ADMIN_PASSWORD = 'Senha123!'; // ✅ Use variáveis de ambiente em produção

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      // ✅ Login bem-sucedido
      res.status(200).json({
        email,
        message: 'Login realizado com sucesso!'
      });
    } else {
      // ❌ Credenciais inválidas
      res.status(401).json({
        error: 'E-mail ou senha inválidos'
      });
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});


// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}/api`);
  console.log(`🔗 Endpoints disponíveis:`);
  console.log(`   GET  /api/pontos-turisticos`);
  console.log(`   POST /api/pontos-turisticos`);
  console.log(`   PUT  /api/pontos-turisticos/:id`);
  console.log(`   DELETE /api/pontos-turisticos/:id`);
  console.log(`   GET  /api/restaurantes`);
  console.log(`   POST /api/restaurantes`);
  console.log(`   PUT  /api/restaurantes/:id`);
  console.log(`   DELETE /api/restaurantes/:id`);
  console.log(`   GET  /api/acomodacoes`);
  console.log(`   POST /api/acomodacoes`);
  console.log(`   PUT  /api/acomodacoes/:id`);
  console.log(`   DELETE /api/acomodacoes/:id`);
});