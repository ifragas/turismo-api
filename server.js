const express = require('express');
const cors = require('cors');
const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, doc, deleteDoc, updateDoc, getDoc } = require('firebase/firestore');
require('dotenv').config();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');

// Firebase Admin SDK
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

const app = express();

// Limiter para proteger a API contra excesso de requisições
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite cada IP a 100 requisições por "windowMs"
  message: {
    error: 'Muitas requisições criadas a partir deste IP, por favor tente novamente após 15 minutos.'
  },
  standardHeaders: true, // Retorna os headers de rate limit nas respostas (`RateLimit-*`)
  legacyHeaders: false, // Desativa os headers `X-RateLimit-*`
});

// Aplica o limitador globalmente em todas as rotas da API
app.use('/api/', limiter);

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

// Dicionário para traduzir a URL para o nome da coleção no Firebase e o tipo do item
const colecoesMap = {
  'pontos-turisticos': { colecao: 'pontosTuristicos', tipoNome: 'Ponto Turístico' },
  'restaurantes': { colecao: 'restaurantes', tipoNome: 'Restaurante' },
  'acomodacoes': { colecao: 'acomodacoes', tipoNome: 'Acomodação' }
};

// Esquema de validação com Joi para os itens de turismo
const itemSchema = Joi.object({
  nome: Joi.string().min(2).max(100).required().messages({
    'string.base': 'O campo nome deve ser uma string',
    'string.empty': 'O campo nome não pode estar vazio',
    'any.required': 'O campo nome é obrigatório'
  }),
  descricao: Joi.string().min(5).max(500).required().messages({
    'string.base': 'O campo descrição deve ser uma string',
    'string.empty': 'O campo descrição não pode estar vazio',
    'any.required': 'O campo descrição é obrigatório'
  }),
  endereco: Joi.string().allow('', null),
  horario: Joi.string().allow('', null),
  imagem: Joi.string().uri().allow('', null),
  imagens: Joi.array().items(Joi.string().uri()).allow(null),
  latitude: Joi.number().allow(null),
  longitude: Joi.number().allow(null)
});

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

// LOGIN - Rota para autenticação com Firebase Auth
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Campos obrigatórios: e-mail e senha'
      });
    }

    // Com esta configuração, QUALQUER usuário cadastrado no Firebase Auth pode fazer login
    // O sistema verifica apenas se o usuário existe, não valida a senha diretamente aqui
    try {
      // Verifica se o usuário existe no Firebase Auth
      const userRecord = await admin.auth().getUserByEmail(email);
      
      // Se chegou aqui, o usuário existe no Firebase
      // Gera um token simples para autenticação nas outras rotas
      const token = 'token_' + Date.now() + '_' + userRecord.uid;
      
      res.status(200).json({
        token,
        email: userRecord.email,
        message: 'Login realizado com sucesso!'
      });
    } catch (firebaseError) {
      // Usuário não encontrado no Firebase Auth
      console.error('Erro Firebase Auth:', firebaseError.code, firebaseError.message);
      res.status(401).json({
        error: 'E-mail ou senha inválidos'
      });
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// GET dinâmico para qualquer categoria com suporte a paginação e ordenação
app.get('/api/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    // Pegamos parâmetros opcionais da query string (ex: /api/pontos-turisticos?limit=5)
    const limitVal = parseInt(req.query.limit);

    // Montamos a query base do Firestore
    let q = collection(db, config.colecao);

    // Se o usuário passou um limite válido, aplicamos limit()
    // Nota: Para usar ordenação por createdAt, podemos adicionar orderBy se desejado
    const snapshot = await getDocs(q);
    let lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Ordena do mais recente para o mais antigo (caso possuam createdAt)
    lista.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    // Aplica o limite se informado
    if (!isNaN(limitVal) && limitVal > 0) {
      lista = lista.slice(0, limitVal);
    }

    res.json(lista);
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

// POST dinâmico - protegido por token e validado com Joi
app.post('/api/:tipo', authenticateToken, async (req, res) => {
  try {
    const { tipo } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    // Valida o corpo da requisição usando o Joi
    const { error, value } = itemSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Erro de validação',
        detalhes: error.details.map(detail => detail.message)
      });
    }

    const { nome, descricao, endereco, horario, imagem, imagens, latitude, longitude } = value;

    const dadosNovoItem = {
      nome,
      descricao,
      endereco: endereco || '',
      horario: horario || '',
      imagem: imagem?.trim() || '',
      imagens: cleanUrls(imagens),
      tipo: config.tipoNome,
      latitude: latitude || null,
      longitude: longitude || null,
      createdAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, config.colecao), dadosNovoItem);

    res.status(201).json({
      id: docRef.id,
      ...dadosNovoItem
    });
  } catch (error) {
    console.error('Erro ao cadastrar item:', error);
    res.status(500).json({ error: 'Erro ao cadastrar item' });
  }
});

// PUT dinâmico - protegido por token e validado com Joi
app.put('/api/:tipo/:id', authenticateToken, async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    // Valida o corpo da requisição usando o Joi
    const { error, value } = itemSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Erro de validação',
        detalhes: error.details.map(detail => detail.message)
      });
    }

    const { nome, descricao, endereco, horario, imagem, imagens, latitude, longitude } = value;

    const docRef = doc(db, config.colecao, id);
    
    const dadosAtualizados = {
      nome,
      descricao,
      endereco: endereco || '',
      horario: horario || '',
      imagem: imagem?.trim() || '',
      imagens: cleanUrls(imagens),
      tipo: config.tipoNome,
      latitude: latitude || null,
      longitude: longitude || null,
      updatedAt: new Date().toISOString()
    };

    await updateDoc(docRef, dadosAtualizados);

    res.status(200).json({
      id,
      ...dadosAtualizados
    });
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    res.status(500).json({ error: 'Erro ao atualizar item' });
  }
});

// DELETE dinâmico - protegido por token - para qualquer categoria
app.delete('/api/:tipo/:id', authenticateToken, async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }

    const docRef = doc(db, config.colecao, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const dados = docSnap.data();

    // Remove imagens associadas do Storage se existirem
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
    res.status(200).json({ message: 'Item excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir item:', error);
    res.status(500).json({ error: 'Erro ao excluir item' });
  }
});


// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});