const express = require('express');
const cors = require('cors');
const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, doc, deleteDoc, updateDoc, getDoc } = require('firebase/firestore');
require('dotenv').config();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

// Firebase Admin SDK
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

const app = express();

// Configuração do Multer para armazenar os arquivos temporariamente na memória RAM
const upload = multer({ storage: multer.memoryStorage() });

// Limiter para proteger a API contra excesso de requisições
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite cada IP a 100 requisições por "windowMs"
  message: {
    error: 'Muitas requisições criadas a partir deste IP, por favor tente novamente após 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Aplica o limitador globalmente em todas as rotas da API
app.use('/api/', limiter);

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Garante tratamento explícito de requisições OPTIONS pré-voo
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  descricao: Joi.string().min(5).max(2000).required().messages({
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

// Função melhorada para extrair o caminho limpo da URL do Storage
const extractFilePath = (url) => {
  if (!url) return null;
  try {
    const match = url.match(/\/o\/(.+?)(\?|$)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch (e) {
    console.error('Erro ao extrair caminho do ficheiro:', e);
  }
  return null;
};

// Função para limpar URLs
const cleanUrls = (urls) => {
  if (!Array.isArray(urls)) return [];
  return urls
    .map(url => url?.trim())
    .filter(url => url && url.startsWith('http'));
};

// Função para limpar o nome do ficheiro para armazenamento seguro
const cleanFileName = (originalName) => {
  return originalName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
};

// Rota raiz
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 API do Guia da Cidade</h1>
    <p>Esta é a API REST do app de turismo da sua cidade.</p>
  `);
});

// Middleware de autenticação real validando o JWT do Firebase Admin SDK
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Erro ao verificar token de autenticação:', error.message);
    return res.status(403).json({ error: 'Token inválido ou expirado.' });
  }
};

// LOGIN - Rota segura para validar email e senha rigorosamente via Firebase Auth REST API
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔑 Tentativa de login para:', email);
    console.log('🔑 FIREBASE_API_KEY presente?', process.env.FIREBASE_API_KEY ? 'Sim' : 'NÃO');

    if (!email || !password) {
      return res.status(400).json({ error: 'Campos obrigatórios: e-mail e senha' });
    }

    const apiKey = process.env.FIREBASE_API_KEY;
    const loginUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    try {
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos' });
      }

      res.status(200).json({
        token: data.idToken,
        email: data.email,
        message: 'Login realizado com sucesso!'
      });

    } catch (authError) {
      console.error('Erro ao autenticar com Firebase Auth:', authError);
      res.status(401).json({ error: 'E-mail ou senha inválidos' });
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// GET dinâmico para qualquer categoria
app.get('/api/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    const limitVal = parseInt(req.query.limit);
    let q = collection(db, config.colecao);
    const snapshot = await getDocs(q);
    let lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    lista.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    if (!isNaN(limitVal) && limitVal > 0) {
      lista = lista.slice(0, limitVal);
    }

    res.json(lista);
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

// POST dinâmico - Protegido por token real, validação Joi e upload Multer
app.post('/api/:tipo', authenticateToken, upload.array('imagens', 10), async (req, res) => {
  let uploadedFilePaths = [];

  try {
    const { tipo } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    const bodyToValidate = {
      nome: req.body.nome ? String(req.body.nome).trim() : '',
      descricao: req.body.descricao ? String(req.body.descricao).trim() : '',
      endereco: req.body.endereco ? String(req.body.endereco).trim() : '',
      horario: req.body.horario ? String(req.body.horario).trim() : '',
      latitude: req.body.latitude !== '' && req.body.latitude != null ? Number(req.body.latitude) : null,
      longitude: req.body.longitude !== '' && req.body.longitude != null ? Number(req.body.longitude) : null,
    };

    const { error } = itemSchema.validate(bodyToValidate, { abortEarly: false });
    if (error) {
      const detalhesErro = error.details.map(detail => detail.message);
      return res.status(400).json({
        error: 'Erro de validação',
        detalhes: detalhesErro
      });
    }

    const imagensURL = [];

    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        const cleanedName = cleanFileName(file.originalname);
        const fileName = Date.now() + '_' + cleanedName;
        const filePath = `imagens/${tipo}/${fileName}`;
        const fileRef = bucket.file(filePath);

        await fileRef.save(file.buffer, {
          metadata: { contentType: file.mimetype },
        });

        uploadedFilePaths.push(filePath);

        const encodedPath = encodeURIComponent(filePath);
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
        imagensURL.push(publicUrl);
      }
    }

    const primeiraImagemURL = imagensURL.length > 0 ? imagensURL[0] : '';

    const dadosNovoItem = {
      nome: bodyToValidate.nome,
      descricao: bodyToValidate.descricao,
      endereco: bodyToValidate.endereco,
      horario: bodyToValidate.horario,
      imagem: primeiraImagemURL,
      imagens: cleanUrls(imagensURL),
      tipo: config.tipoNome,
      latitude: bodyToValidate.latitude,
      longitude: bodyToValidate.longitude,
      createdAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, config.colecao), dadosNovoItem);

    res.status(201).json({
      id: docRef.id,
      ...dadosNovoItem
    });

  } catch (error) {
    console.error('Erro ao cadastrar item:', error);

    if (uploadedFilePaths.length > 0) {
      for (const filePath of uploadedFilePaths) {
        try {
          await bucket.file(filePath).delete();
        } catch (delError) {
          console.error('Erro ao limpar imagem no rollback:', delError.message);
        }
      }
    }

    res.status(500).json({ error: 'Erro ao cadastrar item' });
  }
});

// PUT dinâmico - Protegido por token real, validado com Joi e sincronização de capa
app.put('/api/:tipo/:id', authenticateToken, async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    const { error, value } = itemSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Erro de validação',
        detalhes: error.details.map(detail => detail.message)
      });
    }

    const { nome, descricao, endereco, horario, imagens, latitude, longitude } = value;
    const docRef = doc(db, config.colecao, id);
    
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }
    const dadosAntigos = docSnap.data();

    const novasImagensLimpas = cleanUrls(imagens);

    if (Array.isArray(dadosAntigos.imagens)) {
      for (const urlAntiga of dadosAntigos.imagens) {
        if (!novasImagensLimpas.includes(urlAntiga)) {
          const filePath = extractFilePath(urlAntiga);
          if (filePath) {
            try {
              await bucket.file(filePath).delete();
            } catch (delErr) {
              console.warn('⚠️ Erro ao limpar imagem antiga:', delErr.message);
            }
          }
        }
      }
    }

    const primeiraImagemURL = novasImagensLimpas.length > 0 ? novasImagensLimpas[0] : '';

    const dadosAtualizados = {
      nome,
      descricao,
      endereco: endereco || '',
      horario: horario || '',
      imagem: primeiraImagemURL,
      imagens: novasImagensLimpas,
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

// DELETE dinâmico - Protegido por token real
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

    if (Array.isArray(dados.imagens)) {
      for (const url of dados.imagens) {
        const filePath = extractFilePath(url);
        if (filePath) {
          try {
            await bucket.file(filePath).delete();
          } catch (error) {
            console.warn('⚠️ Erro ao excluir imagem do Storage:', filePath, error.message);
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

// Inicia o servidor (Obrigatório para o server subir!)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});