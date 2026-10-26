const express = require('express');
const cors = require('cors');
require('dotenv').config();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

// Firebase Admin SDK
const admin = require('firebase-admin');

// Validação segura da chave de serviço do Firebase
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} catch (e) {
  console.error('Erro ao parsear FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
}

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

// Middleware CORS configurado corretamente após a criação do app
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializa o Firebase Admin
if (!admin.apps.length && serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

// Configuração do Firestore e Storage via Admin SDK (Privilégios Totais)
const db = admin.apps.length ? admin.firestore() : null;
const bucket = admin.apps.length ? admin.storage().bucket() : null;

// Dicionário para traduzir a URL para o nome da coleção no Firebase e o tipo do item
const colecoesMap = {
  'pontos-turisticos': { colecao: 'pontosTuristicos', tipoNome: 'Ponto Turístico' },
  'restaurantes': { colecao: 'restaurantes', tipoNome: 'Restaurante' },
  'acomodacoes': { colecao: 'acomodacoes', tipoNome: 'Acomodação' }
};

// Esquema de validação com Joi atualizado
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
  coordenadas: Joi.string().allow('', null),
  horarios: Joi.alternatives().try(
    Joi.object(),
    Joi.array(),
    Joi.string()
  ).allow('', null),
  imagem: Joi.string().uri().allow('', null),
  imagens: Joi.array().items(Joi.string().uri()).allow(null)
});

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

    if (!email || !password) {
      return res.status(400).json({ error: 'Campos obrigatórios: e-mail e senha' });
    }

    const apiKey = process.env.FIREBASE_API_KEY;
    const loginUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

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

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// GET dinâmico para qualquer categoria (Admin Firestore)
app.get('/api/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    const snapshot = await db.collection(config.colecao).get();
    let lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    lista.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const limitVal = parseInt(req.query.limit);
    if (!isNaN(limitVal) && limitVal > 0) {
      lista = lista.slice(0, limitVal);
    }

    res.json(lista);
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

// POST dinâmico - Protegido por token, validação Joi, upload Multer e tratamento unificado de coordenadas e horários
app.post('/api/:tipo', authenticateToken, upload.array('imagens', 10), async (req, res) => {
  let uploadedFilePaths = [];

  try {
    const { tipo } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    // Processamento e unificação das coordenadas ("lat, lng")
    let latitude = null;
    let longitude = null;
    const coordenadasStr = req.body.coordenadas ? String(req.body.coordenadas).trim() : '';
    if (coordenadasStr) {
      const parts = coordenadasStr.split(',');
      if (parts.length === 2) {
        const parsedLat = parseFloat(parts[0].trim());
        const parsedLng = parseFloat(parts[1].trim());
        if (!isNaN(parsedLat)) latitude = parsedLat;
        if (!isNaN(parsedLng)) longitude = parsedLng;
      }
    }

    // Processamento do menu de horários (pode vir como JSON string ou objeto/array)
    let horarios = req.body.horarios;
    if (typeof horarios === 'string') {
      try {
        horarios = JSON.parse(horarios);
      } catch (e) {
        // mantém como string se não for JSON
      }
    }

    const bodyToValidate = {
      nome: req.body.nome ? String(req.body.nome).trim() : '',
      descricao: req.body.descricao ? String(req.body.descricao).trim() : '',
      endereco: req.body.endereco ? String(req.body.endereco).trim() : '',
      coordenadas: coordenadasStr,
      horarios: horarios || {}
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

    if (req.files && req.files.length > 0 && bucket) {
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
      horarios: bodyToValidate.horarios,
      coordenadas: bodyToValidate.coordenadas,
      latitude: latitude,
      longitude: longitude,
      imagem: primeiraImagemURL,
      imagens: cleanUrls(imagensURL),
      tipo: config.tipoNome,
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection(config.colecao).add(dadosNovoItem);

    res.status(201).json({
      id: docRef.id,
      ...dadosNovoItem
    });

  } catch (error) {
    console.error('Erro ao cadastrar item:', error);

    if (uploadedFilePaths.length > 0 && bucket) {
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

// PUT dinâmico - Protegido por token, validação Joi e atualização de coordenadas/horários estruturados
app.put('/api/:tipo/:id', authenticateToken, upload.array('imagens', 10), async (req, res) => {
  let uploadedFilePaths = [];

  try {
    const { tipo, id } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    let latitude = null;
    let longitude = null;
    const coordenadasStr = req.body.coordenadas ? String(req.body.coordenadas).trim() : '';
    if (coordenadasStr) {
      const parts = coordenadasStr.split(',');
      if (parts.length === 2) {
        const parsedLat = parseFloat(parts[0].trim());
        const parsedLng = parseFloat(parts[1].trim());
        if (!isNaN(parsedLat)) latitude = parsedLat;
        if (!isNaN(parsedLng)) longitude = parsedLng;
      }
    }

    let horarios = req.body.horarios;
    if (typeof horarios === 'string') {
      try {
        horarios = JSON.parse(horarios);
      } catch (e) {}
    }

    const bodyToValidate = {
      nome: req.body.nome ? String(req.body.nome).trim() : '',
      descricao: req.body.descricao ? String(req.body.descricao).trim() : '',
      endereco: req.body.endereco ? String(req.body.endereco).trim() : '',
      coordenadas: coordenadasStr,
      horarios: horarios || {}
    };

    const { error } = itemSchema.validate(bodyToValidate, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Erro de validação',
        detalhes: error.details.map(detail => detail.message)
      });
    }

    const docRef = db.collection(config.colecao).doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }
    const dadosAntigos = docSnap.data();

    let imagensExistentes = req.body.imagensExistentes || [];
    if (typeof imagensExistentes === 'string') imagensExistentes = [imagensExistentes];

    if (Array.isArray(dadosAntigos.imagens) && bucket) {
      for (const urlAntiga of dadosAntigos.imagens) {
        if (!imagensExistentes.includes(urlAntiga)) {
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

    const novasImagensURL = [];
    if (req.files && req.files.length > 0 && bucket) {
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
        novasImagensURL.push(publicUrl);
      }
    }

    const todasImagensLimpas = cleanUrls([...imagensExistentes, ...novasImagensURL]);
    const primeiraImagemURL = todasImagensLimpas.length > 0 ? todasImagensLimpas[0] : '';

    const dadosAtualizados = {
      nome: bodyToValidate.nome,
      descricao: bodyToValidate.descricao,
      endereco: bodyToValidate.endereco,
      horarios: bodyToValidate.horarios,
      coordenadas: bodyToValidate.coordenadas,
      latitude: latitude,
      longitude: longitude,
      imagem: primeiraImagemURL,
      imagens: todasImagensLimpas,
      tipo: config.tipoNome,
      updatedAt: new Date().toISOString()
    };

    await docRef.update(dadosAtualizados);

    res.status(200).json({
      id,
      ...dadosAtualizados
    });
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    if (uploadedFilePaths.length > 0 && bucket) {
      for (const filePath of uploadedFilePaths) {
        try {
          await bucket.file(filePath).delete();
        } catch (e) {}
      }
    }
    res.status(500).json({ error: 'Erro ao atualizar item' });
  }
});

// DELETE dinâmico - Protegido por token real (Admin Firestore)
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

    const docRef = db.collection(config.colecao).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const dados = docSnap.data();

    if (Array.isArray(dados.imagens) && bucket) {
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

    await docRef.delete();
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