const express = require('express');
const cors = require('cors');
const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, doc, deleteDoc, updateDoc, getDoc } = require('firebase/firestore');
require('dotenv').config();

// Firebase Admin SDK
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Configuração do Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Inicializa o Firebase
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();

// Inicializa o Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const bucket = admin.storage().bucket();

// Função para extrair caminho da URL do Storage
const extractFilePath = (url) => {
  if (!url) return null;
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

// Rota raiz
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 API do Guia da Cidade</h1>
    <p>Esta é a API REST do app de turismo da sua cidade.</p>
    <h2>🔗 Endpoints disponíveis:</h2>
    <ul>
      <li>POST /api/login</li>
      <li>GET /api/pontos-turisticos</li>
      <li>POST /api/pontos-turisticos</li>
      <li>PUT /api/pontos-turisticos/:id</li>
      <li>DELETE /api/pontos-turisticos/:id</li>
      <li>GET /api/restaurantes</li>
      <li>POST /api/restaurantes</li>
      <li>PUT /api/restaurantes/:id</li>
      <li>DELETE /api/restaurantes/:id</li>
      <li>GET /api/acomodacoes</li>
      <li>POST /api/acomodacoes</li>
      <li>PUT /api/acomodacoes/:id</li>
      <li>DELETE /api/acomodacoes/:id</li>
    </ul>
  `);
});

// Middleware de autenticação simples
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }

  // Para simplificar, aceita qualquer token não vazio
  next();
};

// LOGIN - Rota para autenticação
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Campos obrigatórios: e-mail e senha'
      });
    }

    // Em produção, conecte com Firebase Auth ou banco de dados
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@cidade.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Senha123!';

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const token = 'token_valido_' + Date.now();
      
      res.status(200).json({
        token,
        email,
        message: 'Login realizado com sucesso!'
      });
    } else {
      res.status(401).json({
        error: 'E-mail ou senha inválidos'
      });
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// ========================
// PONTOS TURÍSTICOS
// ========================

app.get('/api/pontos-turisticos', authenticateToken, async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, 'pontosTuristicos'));
    const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(lista);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar pontos turísticos' });
  }
});

app.post('/api/pontos-turisticos', authenticateToken, async (req, res) => {
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

app.put('/api/pontos-turisticos/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/pontos-turisticos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }

    const docRef = doc(db, 'pontosTuristicos', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const dados = docSnap.data();

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

app.get('/api/restaurantes', authenticateToken, async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, 'restaurantes'));
    const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(lista);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar restaurantes' });
  }
});

app.post('/api/restaurantes', authenticateToken, async (req, res) => {
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

app.put('/api/restaurantes/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/restaurantes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }

    const docRef = doc(db, 'restaurantes', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const dados = docSnap.data();

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

app.get('/api/acomodacoes', authenticateToken, async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, 'acomodacoes'));
    const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(lista);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar acomodações' });
  }
});

app.post('/api/acomodacoes', authenticateToken, async (req, res) => {
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

app.put('/api/acomodacoes/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/acomodacoes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }

    const docRef = doc(db, 'acomodacoes', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const dados = docSnap.data();

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

    await deleteDoc(docRef);
    res.status(200).json({ message: 'Acomodação excluída com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir acomodação:', error);
    res.status(500).json({ error: 'Erro ao excluir acomodação' });
  }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});