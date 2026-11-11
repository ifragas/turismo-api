const { db, bucket } = require('../config/firebase');
const { itemSchema } = require('../validators/turismoValidator');
const { servicosSchema } = require('../validators/servicosSchema');

const colecoesMap = {
  'pontos-turisticos': { colecao: 'pontosTuristicos', tipoNome: 'Ponto Turístico' },
  'restaurantes': { colecao: 'restaurantes', tipoNome: 'Restaurante' },
  'acomodacoes': { colecao: 'acomodacoes', tipoNome: 'Acomodação' },
  'servicos': { colecao: 'servicos', tipoNome: 'Serviço' }
};

// Funções Utilitárias Internas
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

const cleanUrls = (urls) => {
  if (!Array.isArray(urls)) return [];
  return urls.map(url => url?.trim()).filter(url => url && url.startsWith('http'));
};

const cleanFileName = (originalName) => {
  return originalName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
};

const responderErroValidacao = (res, error) => {
  return res.status(400).json({
    error: 'Erro de validação',
    detalhes: error.details.map(detail => detail.message)
  });
};

const paraNumeroOpcional = (value) => {
  if (value === undefined || value === '') return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).trim());
  return Number.isNaN(parsed) ? value : parsed;
};

const normalizarImagens = (imagens) => {
  if (imagens === undefined) return undefined;
  if (imagens === null || imagens === '') return [];

  let lista = imagens;
  if (typeof imagens === 'string') {
    const trimmed = imagens.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      lista = Array.isArray(parsed) ? parsed : [trimmed];
    } catch (e) {
      lista = [trimmed];
    }
  }

  if (!Array.isArray(lista)) return lista;
  return lista.map(item => (item == null ? '' : String(item).trim())).filter(Boolean);
};

const normalizarServico = (body = {}) => {
  const payload = {};

  if (body.nome !== undefined && body.nome !== null) payload.nome = String(body.nome).trim();
  if (body.descricao !== undefined && body.descricao !== null) payload.descricao = String(body.descricao).trim();
  if (body.tipoServico !== undefined && body.tipoServico !== null) {
    payload.tipoServico = String(body.tipoServico).trim();
  }
  if (body.telefone !== undefined && body.telefone !== null) payload.telefone = String(body.telefone).trim();
  if (body.whatsapp !== undefined && body.whatsapp !== null) payload.whatsapp = String(body.whatsapp).trim();
  if (body.endereco !== undefined && body.endereco !== null) payload.endereco = String(body.endereco).trim();
  if (body.coordenadas !== undefined && body.coordenadas !== null) payload.coordenadas = String(body.coordenadas).trim();
  if (body.linkExterno !== undefined && body.linkExterno !== null) payload.linkExterno = String(body.linkExterno).trim();

  const latitude = paraNumeroOpcional(body.latitude);
  const longitude = paraNumeroOpcional(body.longitude);
  if (latitude !== undefined) payload.latitude = latitude;
  if (longitude !== undefined) payload.longitude = longitude;
  if (body.funcionamento24h !== undefined) payload.funcionamento24h = body.funcionamento24h;

  if (body.redesSociais !== undefined) {
    if (typeof body.redesSociais === 'string') {
      try { payload.redesSociais = JSON.parse(body.redesSociais); } catch (e) { payload.redesSociais = {}; }
    } else {
      payload.redesSociais = body.redesSociais;
    }
  }

  if (body.horarios !== undefined) {
    if (typeof body.horarios === 'string') {
      try { payload.horarios = JSON.parse(body.horarios); } catch (e) { payload.horarios = {}; }
    } else {
      payload.horarios = body.horarios;
    }
  }

  const imagens = normalizarImagens(body.imagens);
  if (imagens !== undefined) payload.imagens = imagens;

  return payload;
};

const validarServico = (body) => {
  return servicosSchema.validate(normalizarServico(body), { abortEarly: false });
};

const enviarImagens = async (files, tipo, uploadedFilePaths) => {
  const imagensURL = [];

  if (files && files.length > 0 && bucket) {
    for (const file of files) {
      const cleanedName = cleanFileName(file.originalname);
      const fileName = Date.now() + '_' + cleanedName;
      const filePath = `imagens/${tipo}/${fileName}`;
      const fileRef = bucket.file(filePath);

      await fileRef.save(file.buffer, { metadata: { contentType: file.mimetype } });
      uploadedFilePaths.push(filePath);

      const encodedPath = encodeURIComponent(filePath);
      imagensURL.push(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`);
    }
  }

  return imagensURL;
};

// 1. LOGIN
const login = async (req, res) => {
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
};

// 2. GET (Listar Itens)
const listarItens = async (req, res) => {
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
};

// 3. POST (Criar Item)
const criarItem = async (req, res) => {
  let uploadedFilePaths = [];

  try {
    const { tipo } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    if (tipo === 'servicos') {
      const { error, value } = validarServico(req.body);
      if (error) {
        return responderErroValidacao(res, error);
      }

      const imagensEnviadas = await enviarImagens(req.files, tipo, uploadedFilePaths);
      const imagens = [...(value.imagens || []), ...imagensEnviadas];
      const dadosNovoItem = {
        ...value,
        imagens,
        tipo: config.tipoNome,
        createdAt: new Date().toISOString()
      };

      const docRef = await db.collection(config.colecao).add(dadosNovoItem);
      return res.status(201).json({ id: docRef.id, ...dadosNovoItem });
    }

    // Coordenadas
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

    // Horários
    let horarios = req.body.horarios;
    if (typeof horarios === 'string') {
      try { horarios = JSON.parse(horarios); } catch (e) {}
    }

    // Sempre Aberto
    let sempreAberto = req.body.sempreAberto;
    if (typeof sempreAberto === 'string') {
      sempreAberto = sempreAberto === 'true';
    } else {
      sempreAberto = Boolean(sempreAberto);
    }

    // WhatsApp
    let whatsapp = req.body.whatsapp;
    if (typeof whatsapp === 'string') {
      try { whatsapp = JSON.parse(whatsapp); } catch (e) { whatsapp = whatsapp ? [whatsapp] : []; }
    }
    if (!Array.isArray(whatsapp)) whatsapp = [];
    whatsapp = whatsapp.map(num => String(num).trim()).filter(Boolean);

    // Redes Sociais
    let redesSociais = req.body.redesSociais;
    if (typeof redesSociais === 'string') {
      try { redesSociais = JSON.parse(redesSociais); } catch (e) { redesSociais = {}; }
    }
    redesSociais = {
      instagram: redesSociais?.instagram ? String(redesSociais.instagram).trim() : '',
      facebook: redesSociais?.facebook ? String(redesSociais.facebook).trim() : '',
      tiktok: redesSociais?.tiktok ? String(redesSociais.tiktok).trim() : ''
    };

    let linkExterno = req.body.linkExterno ? String(req.body.linkExterno).trim() : '';
    let telefone = req.body.telefone ? String(req.body.telefone).trim() : ''; // ✅ ADICIONADO: Leitura do telefone

    const bodyToValidate = {
      nome: req.body.nome ? String(req.body.nome).trim() : '',
      descricao: req.body.descricao ? String(req.body.descricao).trim() : '',
      endereco: req.body.endereco ? String(req.body.endereco).trim() : '',
      coordenadas: coordenadasStr,
      linkExterno: linkExterno,
      telefone: telefone, // ✅ ADICIONADO: Inclusão no objeto de validação
      horarios: horarios || {},
      sempreAberto: sempreAberto,
      whatsapp: whatsapp,
      redesSociais: redesSociais
    };

    const { error } = itemSchema.validate(bodyToValidate, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Erro de validação',
        detalhes: error.details.map(detail => detail.message)
      });
    }

    const imagensURL = [];
    if (req.files && req.files.length > 0 && bucket) {
      for (let file of req.files) {
        const cleanedName = cleanFileName(file.originalname);
        const fileName = Date.now() + '_' + cleanedName;
        const filePath = `imagens/${tipo}/${fileName}`;
        const fileRef = bucket.file(filePath);

        await fileRef.save(file.buffer, { metadata: { contentType: file.mimetype } });
        uploadedFilePaths.push(filePath);

        const encodedPath = encodeURIComponent(filePath);
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
        imagensURL.push(publicUrl);
      }
    }

    const primeiraImagemURL = imagensURL.length > 0 ? imagensURL[0] : '';

    const dadosNovoItem = {
      ...bodyToValidate,
      latitude,
      longitude,
      imagem: primeiraImagemURL,
      imagens: cleanUrls(imagensURL),
      tipo: config.tipoNome,
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection(config.colecao).add(dadosNovoItem);

    res.status(201).json({ id: docRef.id, ...dadosNovoItem });
  } catch (error) {
    console.error('Erro ao cadastrar item:', error);
    if (uploadedFilePaths.length > 0 && bucket) {
      for (const filePath of uploadedFilePaths) {
        try { await bucket.file(filePath).delete(); } catch (e) {}
      }
    }
    res.status(500).json({ error: 'Erro ao cadastrar item' });
  }
};

// 4. PUT (Atualizar Item)
const atualizarItem = async (req, res) => {
  let uploadedFilePaths = [];

  try {
    const { tipo, id } = req.params;
    const config = colecoesMap[tipo];

    if (!config) {
      return res.status(400).json({ error: 'Tipo de coleção inválido' });
    }

    if (tipo === 'servicos') {
      const { error, value } = validarServico(req.body);
      if (error) {
        return responderErroValidacao(res, error);
      }

      const docRef = db.collection(config.colecao).doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Documento não encontrado' });
      }
      const dadosAntigos = docSnap.data();

      const imagensInformadas = Object.prototype.hasOwnProperty.call(req.body, 'imagens')
        ? (value.imagens || [])
        : (Array.isArray(dadosAntigos.imagens) ? dadosAntigos.imagens : []);

      if (Array.isArray(dadosAntigos.imagens) && bucket) {
        for (const urlAntiga of dadosAntigos.imagens) {
          if (!imagensInformadas.includes(urlAntiga)) {
            const filePath = extractFilePath(urlAntiga);
            if (filePath) {
              try { await bucket.file(filePath).delete(); } catch (delErr) {}
            }
          }
        }
      }

      const novasImagensURL = await enviarImagens(req.files, tipo, uploadedFilePaths);
      const imagens = [...imagensInformadas, ...novasImagensURL];
      
      const dadosAtualizados = {
        ...value,
        imagens,
        tipo: config.tipoNome,
        updatedAt: new Date().toISOString()
      };

      await docRef.update(dadosAtualizados);
      return res.status(200).json({ id, ...dadosAtualizados });
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
      try { horarios = JSON.parse(horarios); } catch (e) {}
    }

    let sempreAberto = req.body.sempreAberto;
    if (typeof sempreAberto === 'string') {
      sempreAberto = sempreAberto === 'true';
    } else {
      sempreAberto = Boolean(sempreAberto);
    }

    let whatsapp = req.body.whatsapp;
    if (typeof whatsapp === 'string') {
      try { whatsapp = JSON.parse(whatsapp); } catch (e) { whatsapp = whatsapp ? [whatsapp] : []; }
    }
    if (!Array.isArray(whatsapp)) whatsapp = [];
    whatsapp = whatsapp.map(num => String(num).trim()).filter(Boolean);

    let redesSociais = req.body.redesSociais;
    if (typeof redesSociais === 'string') {
      try { redesSociais = JSON.parse(redesSociais); } catch (e) { redesSociais = {}; }
    }
    redesSociais = {
      instagram: redesSociais?.instagram ? String(redesSociais.instagram).trim() : '',
      facebook: redesSociais?.facebook ? String(redesSociais.facebook).trim() : '',
      tiktok: redesSociais?.tiktok ? String(redesSociais.tiktok).trim() : ''
    };

    let linkExterno = req.body.linkExterno ? String(req.body.linkExterno).trim() : '';
    let telefone = req.body.telefone ? String(req.body.telefone).trim() : ''; // ✅ ADICIONADO: Leitura do telefone

    const bodyToValidate = {
      nome: req.body.nome ? String(req.body.nome).trim() : '',
      descricao: req.body.descricao ? String(req.body.descricao).trim() : '',
      endereco: req.body.endereco ? String(req.body.endereco).trim() : '',
      coordenadas: coordenadasStr,
      linkExterno: linkExterno,
      telefone: telefone, // ✅ ADICIONADO: Inclusão no objeto de validação
      horarios: horarios || {},
      sempreAberto: sempreAberto,
      whatsapp: whatsapp,
      redesSociais: redesSociais
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
            try { await bucket.file(filePath).delete(); } catch (delErr) {}
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

        await fileRef.save(file.buffer, { metadata: { contentType: file.mimetype } });
        uploadedFilePaths.push(filePath);

        const encodedPath = encodeURIComponent(filePath);
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
        novasImagensURL.push(publicUrl);
      }
    }

    const todasImagensLimpas = cleanUrls([...imagensExistentes, ...novasImagensURL]);
    const primeiraImagemURL = todasImagensLimpas.length > 0 ? todasImagensLimpas[0] : '';

    const dadosAtualizados = {
      ...bodyToValidate,
      latitude,
      longitude,
      imagem: primeiraImagemURL,
      imagens: todasImagensLimpas,
      tipo: config.tipoNome,
      updatedAt: new Date().toISOString()
    };

    await docRef.update(dadosAtualizados);

    res.status(200).json({ id, ...dadosAtualizados });
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    if (uploadedFilePaths.length > 0 && bucket) {
      for (const filePath of uploadedFilePaths) {
        try { await bucket.file(filePath).delete(); } catch (e) {}
      }
    }
    res.status(500).json({ error: 'Erro ao atualizar item' });
  }
};

// 5. DELETE (Excluir Item)
const deletarItem = async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const config = colecoesMap[tipo];

    if (!config || !id) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
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
          try { await bucket.file(filePath).delete(); } catch (error) {}
        }
      }
    }

    await docRef.delete();
    res.status(200).json({ message: 'Item excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir item:', error);
    res.status(500).json({ error: 'Erro ao excluir item' });
  }
};

module.exports = {
  login,
  listarItens,
  criarItem,
  atualizarItem,
  deletarItem
};