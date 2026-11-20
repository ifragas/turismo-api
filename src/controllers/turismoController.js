const { db, bucket } = require('../config/firebase');
const { itemSchema } = require('../validators/turismoValidator');
const { servicosSchema } = require('../validators/servicosSchema');

const colecoesMap = {
  'pontos-turisticos': { colecao: 'pontosTuristicos', tipoNome: 'Ponto Turístico' },
  'restaurantes': { colecao: 'restaurantes', tipoNome: 'Restaurante' },
  'acomodacoes': { colecao: 'acomodacoes', tipoNome: 'Acomodação' },
  'servicos': { colecao: 'servicos', tipoNome: 'Serviço' }
};

// ==========================================
// UTILITÁRIOS INTERNOS
// ==========================================
const extractFilePath = (url) => {
  if (!url) return null;
  try {
    const match = url.match(/\/o\/(.+?)(\?|$)/);
    if (match && match[1]) return decodeURIComponent(match[1]);
  } catch (e) { console.error('Erro ao extrair caminho do ficheiro:', e); }
  return null;
};

const cleanUrls = (urls) => {
  if (!Array.isArray(urls)) return [];
  return urls.map(url => url?.trim()).filter(url => url && url.startsWith('http'));
};

const cleanFileName = (originalName) => {
  return originalName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
};

const responderErroValidacao = (res, error) => {
  return res.status(400).json({ error: 'Erro de validação', detalhes: error.details.map(detail => detail.message) });
};

const paraNumeroOpcional = (value) => {
  if (value === undefined || value === '') return undefined;
  if (value === null) return null;
  const parsed = Number(String(value).trim());
  return Number.isNaN(parsed) ? value : parsed;
};

const normalizarImagens = (imagens) => {
  if (imagens === undefined) return undefined;
  if (imagens === null || imagens === '') return [];
  let lista = imagens;
  if (typeof imagens === 'string') {
    try { const parsed = JSON.parse(imagens.trim()); lista = Array.isArray(parsed) ? parsed : [imagens.trim()]; } 
    catch (e) { lista = [imagens.trim()]; }
  }
  if (!Array.isArray(lista)) return lista;
  return lista.map(item => (item == null ? '' : String(item).trim())).filter(Boolean);
};

const normalizarServico = (body = {}) => {
  const payload = {};
  if (body.nome !== undefined) payload.nome = String(body.nome).trim();
  if (body.descricao !== undefined) payload.descricao = String(body.descricao).trim();
  if (body.tipoServico !== undefined) payload.tipoServico = String(body.tipoServico).trim();
  if (body.telefone !== undefined) payload.telefone = String(body.telefone).trim();
  if (body.whatsapp !== undefined) payload.whatsapp = String(body.whatsapp).trim();
  if (body.endereco !== undefined) payload.endereco = String(body.endereco).trim();
  if (body.coordenadas !== undefined) payload.coordenadas = String(body.coordenadas).trim();
  if (body.linkExterno !== undefined) payload.linkExterno = String(body.linkExterno).trim();

  const latitude = paraNumeroOpcional(body.latitude);
  const longitude = paraNumeroOpcional(body.longitude);
  if (latitude !== undefined) payload.latitude = latitude;
  if (longitude !== undefined) payload.longitude = longitude;
  if (body.funcionamento24h !== undefined) payload.funcionamento24h = body.funcionamento24h;

  if (body.redesSociais !== undefined) {
    try { payload.redesSociais = typeof body.redesSociais === 'string' ? JSON.parse(body.redesSociais) : body.redesSociais; } 
    catch (e) { payload.redesSociais = {}; }
  }
  if (body.horarios !== undefined) {
    try { payload.horarios = typeof body.horarios === 'string' ? JSON.parse(body.horarios) : body.horarios; } 
    catch (e) { payload.horarios = {}; }
  }
  const imagens = normalizarImagens(body.imagens);
  if (imagens !== undefined) payload.imagens = imagens;

  return payload;
};

const validarServico = (body) => servicosSchema.validate(normalizarServico(body), { abortEarly: false });

const enviarImagens = async (files, tipo, uploadedFilePaths) => {
  const imagensURL = [];
  if (files && files.length > 0 && bucket) {
    for (const file of files) {
      const cleanedName = cleanFileName(file.originalname);
      const fileName = Date.now() + '_' + cleanedName;
      const filePath = `imagens/${tipo}/${fileName}`;
      await bucket.file(filePath).save(file.buffer, { metadata: { contentType: file.mimetype } });
      uploadedFilePaths.push(filePath);
      imagensURL.push(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`);
    }
  }
  return imagensURL;
};

// ==========================================
// 1. LOGIN
// ==========================================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Campos obrigatórios: e-mail e senha' });

    const apiKey = process.env.FIREBASE_API_KEY;
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (!response.ok) return res.status(401).json({ error: 'E-mail ou senha inválidos' });

    res.status(200).json({ token: data.idToken, email: data.email, message: 'Login realizado com sucesso!' });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
};

// ==========================================
// 2. GET (Listar Itens) - BLINDADO POR CIDADE
// ==========================================
const listarItens = async (req, res) => {
  try {
    const { tipo } = req.params;
    const config = colecoesMap[tipo];
    if (!config) return res.status(400).json({ error: 'Tipo de coleção inválido' });

    let query = db.collection(config.colecao);

    if (req.user && (req.user.role === 'city_admin' || req.user.role === 'editor')) {
      query = query.where('cidadeId', '==', req.user.cidadeId);
    } else if (req.user && req.user.role === 'super_admin' && req.query.cidadeId) {
      query = query.where('cidadeId', '==', req.query.cidadeId);
    } else if (!req.user && req.query.cidadeId) {
      query = query.where('cidadeId', '==', req.query.cidadeId);
    }

    const snapshot = await query.get();
    let lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    lista.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const limitVal = parseInt(req.query.limit);
    if (!isNaN(limitVal) && limitVal > 0) lista = lista.slice(0, limitVal);

    res.json(lista);
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
};

// ==========================================
// 3. POST (Criar Item) - VALIDAÇÃO RIGOROSA DE cidadeId
// ==========================================
const criarItem = async (req, res) => {
  let uploadedFilePaths = [];
  try {
    const { tipo } = req.params;
    const config = colecoesMap[tipo];
    if (!config) return res.status(400).json({ error: 'Tipo de coleção inválido' });

    let cidadeIdParaSalvar;
    if (req.user.role === 'super_admin') {
      cidadeIdParaSalvar = req.body.cidadeId;
      if (!cidadeIdParaSalvar) {
        return res.status(400).json({ error: 'Super admin deve informar o cidadeId ao cadastrar itens.' });
      }
    } else {
      cidadeIdParaSalvar = req.user.cidadeId;
      if (!cidadeIdParaSalvar) {
        return res.status(400).json({ error: 'Usuário não possui cidade vinculada. Contate o administrador.' });
      }
    }
    cidadeIdParaSalvar = String(cidadeIdParaSalvar).toLowerCase().trim();

    if (tipo === 'servicos') {
      const { error, value } = validarServico(req.body);
      if (error) return responderErroValidacao(res, error);

      const imagensEnviadas = await enviarImagens(req.files, tipo, uploadedFilePaths);
      const dadosNovoItem = {
        ...value,
        cidadeId: cidadeIdParaSalvar,
        imagens: [...(value.imagens || []), ...imagensEnviadas],
        tipo: config.tipoNome,
        createdAt: new Date().toISOString()
      };

      const docRef = await db.collection(config.colecao).add(dadosNovoItem);
      return res.status(201).json({ id: docRef.id, ...dadosNovoItem });
    }

    let latitude = null, longitude = null;
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
    if (typeof horarios === 'string') { try { horarios = JSON.parse(horarios); } catch (e) {} }

    let sempreAberto = typeof req.body.sempreAberto === 'string' ? req.body.sempreAberto === 'true' : Boolean(req.body.sempreAberto);

    let whatsapp = req.body.whatsapp;
    if (typeof whatsapp === 'string') { try { whatsapp = JSON.parse(whatsapp); } catch (e) { whatsapp = whatsapp ? [whatsapp] : []; } }
    if (!Array.isArray(whatsapp)) whatsapp = [];
    whatsapp = whatsapp.map(num => String(num).trim()).filter(Boolean);

    let redesSociais = req.body.redesSociais;
    if (typeof redesSociais === 'string') { try { redesSociais = JSON.parse(redesSociais); } catch (e) { redesSociais = {}; } }
    redesSociais = {
      instagram: redesSociais?.instagram ? String(redesSociais.instagram).trim() : '',
      facebook: redesSociais?.facebook ? String(redesSociais.facebook).trim() : '',
      tiktok: redesSociais?.tiktok ? String(redesSociais.tiktok).trim() : ''
    };

    const bodyToValidate = {
      nome: req.body.nome ? String(req.body.nome).trim() : '',
      descricao: req.body.descricao ? String(req.body.descricao).trim() : '',
      endereco: req.body.endereco ? String(req.body.endereco).trim() : '',
      coordenadas: coordenadasStr,
      linkExterno: req.body.linkExterno ? String(req.body.linkExterno).trim() : '',
      telefone: req.body.telefone ? String(req.body.telefone).trim() : '',
      horarios: horarios || {},
      sempreAberto: sempreAberto,
      whatsapp: whatsapp,
      redesSociais: redesSociais
    };

    const { error } = itemSchema.validate(bodyToValidate, { abortEarly: false });
    if (error) return res.status(400).json({ error: 'Erro de validação', detalhes: error.details.map(d => d.message) });

    const imagensURL = [];
    if (req.files && req.files.length > 0 && bucket) {
      for (let file of req.files) {
        const cleanedName = cleanFileName(file.originalname);
        const fileName = Date.now() + '_' + cleanedName;
        const filePath = `imagens/${tipo}/${fileName}`;
        await bucket.file(filePath).save(file.buffer, { metadata: { contentType: file.mimetype } });
        uploadedFilePaths.push(filePath);
        imagensURL.push(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`);
      }
    }

    const dadosNovoItem = {
      ...bodyToValidate,
      cidadeId: cidadeIdParaSalvar,
      latitude,
      longitude,
      imagem: imagensURL.length > 0 ? imagensURL[0] : '',
      imagens: cleanUrls(imagensURL),
      tipo: config.tipoNome,
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection(config.colecao).add(dadosNovoItem);
    res.status(201).json({ id: docRef.id, ...dadosNovoItem });
  } catch (error) {
    console.error('Erro ao cadastrar item:', error);
    if (uploadedFilePaths.length > 0 && bucket) {
      for (const filePath of uploadedFilePaths) { try { await bucket.file(filePath).delete(); } catch (e) {} }
    }
    res.status(500).json({ error: 'Erro ao cadastrar item' });
  }
};

// ==========================================
// 4. PUT (Atualizar Item) - 🚨 LÓGICA CORRIGIDA PARA PERMITIR TROCA DE CIDADE
// ==========================================
const atualizarItem = async (req, res) => {
  let uploadedFilePaths = [];
  try {
    const { tipo, id } = req.params;
    const config = colecoesMap[tipo];
    if (!config) return res.status(400).json({ error: 'Tipo de coleção inválido' });

    const docRef = db.collection(config.colecao).doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return res.status(404).json({ error: 'Documento não encontrado' });
    
    const dadosAntigos = docSnap.data();

    // 🚨 NOVA LÓGICA: Definir cidadeIdParaSalvar
    let cidadeIdParaSalvar;

    if (req.user.role === 'super_admin') {
      // Super admin PODE alterar a cidade do item. Usamos o que veio do form, ou mantemos o antigo se não veio.
      cidadeIdParaSalvar = req.body.cidadeId ? String(req.body.cidadeId).toLowerCase().trim() : dadosAntigos.cidadeId;
      if (!cidadeIdParaSalvar) {
        return res.status(400).json({ error: 'Super admin deve informar o cidadeId ao atualizar itens.' });
      }
    } else {
      // City admin/editor NÃO pode mudar a cidade. Bloqueia se tentar editar item de outra cidade.
      if (dadosAntigos.cidadeId !== req.user.cidadeId) {
        return res.status(403).json({ error: 'Acesso negado: Você não pode editar itens desta cidade.' });
      }
      cidadeIdParaSalvar = dadosAntigos.cidadeId;
    }

    if (tipo === 'servicos') {
      const { error, value } = validarServico(req.body);
      if (error) return responderErroValidacao(res, error);

      const imagensInformadas = Object.prototype.hasOwnProperty.call(req.body, 'imagens') ? (value.imagens || []) : (Array.isArray(dadosAntigos.imagens) ? dadosAntigos.imagens : []);
      if (Array.isArray(dadosAntigos.imagens) && bucket) {
        for (const urlAntiga of dadosAntigos.imagens) {
          if (!imagensInformadas.includes(urlAntiga)) {
            const filePath = extractFilePath(urlAntiga);
            if (filePath) { try { await bucket.file(filePath).delete(); } catch (e) {} }
          }
        }
      }

      const novasImagensURL = await enviarImagens(req.files, tipo, uploadedFilePaths);
      await docRef.update({ ...value, cidadeId: cidadeIdParaSalvar, imagens: [...imagensInformadas, ...novasImagensURL], tipo: config.tipoNome, updatedAt: new Date().toISOString() });
      return res.status(200).json({ id, ...dadosAntigos, ...value, imagens: [...imagensInformadas, ...novasImagensURL] });
    }

    // Processamento genérico de atualização
    let latitude = null, longitude = null;
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
    if (typeof horarios === 'string') { try { horarios = JSON.parse(horarios); } catch (e) {} }
    let sempreAberto = typeof req.body.sempreAberto === 'string' ? req.body.sempreAberto === 'true' : Boolean(req.body.sempreAberto);
    
    let whatsapp = req.body.whatsapp;
    if (typeof whatsapp === 'string') { try { whatsapp = JSON.parse(whatsapp); } catch (e) { whatsapp = whatsapp ? [whatsapp] : []; } }
    if (!Array.isArray(whatsapp)) whatsapp = [];
    whatsapp = whatsapp.map(num => String(num).trim()).filter(Boolean);

    let redesSociais = req.body.redesSociais;
    if (typeof redesSociais === 'string') { try { redesSociais = JSON.parse(redesSociais); } catch (e) { redesSociais = {}; } }
    redesSociais = {
      instagram: redesSociais?.instagram ? String(redesSociais.instagram).trim() : '',
      facebook: redesSociais?.facebook ? String(redesSociais.facebook).trim() : '',
      tiktok: redesSociais?.tiktok ? String(redesSociais.tiktok).trim() : ''
    };

    const bodyToValidate = {
      nome: req.body.nome ? String(req.body.nome).trim() : '',
      descricao: req.body.descricao ? String(req.body.descricao).trim() : '',
      endereco: req.body.endereco ? String(req.body.endereco).trim() : '',
      coordenadas: coordenadasStr,
      linkExterno: req.body.linkExterno ? String(req.body.linkExterno).trim() : '',
      telefone: req.body.telefone ? String(req.body.telefone).trim() : '',
      horarios: horarios || {},
      sempreAberto: sempreAberto,
      whatsapp: whatsapp,
      redesSociais: redesSociais
    };

    const { error } = itemSchema.validate(bodyToValidate, { abortEarly: false });
    if (error) return res.status(400).json({ error: 'Erro de validação', detalhes: error.details.map(d => d.message) });

    let imagensExistentes = req.body.imagensExistentes || [];
    if (typeof imagensExistentes === 'string') imagensExistentes = [imagensExistentes];

    if (Array.isArray(dadosAntigos.imagens) && bucket) {
      for (const urlAntiga of dadosAntigos.imagens) {
        if (!imagensExistentes.includes(urlAntiga)) {
          const filePath = extractFilePath(urlAntiga);
          if (filePath) { try { await bucket.file(filePath).delete(); } catch (e) {} }
        }
      }
    }

    const novasImagensURL = [];
    if (req.files && req.files.length > 0 && bucket) {
      for (let file of req.files) {
        const cleanedName = cleanFileName(file.originalname);
        const fileName = Date.now() + '_' + cleanedName;
        const filePath = `imagens/${tipo}/${fileName}`;
        await bucket.file(filePath).save(file.buffer, { metadata: { contentType: file.mimetype } });
        uploadedFilePaths.push(filePath);
        novasImagensURL.push(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`);
      }
    }

    const todasImagensLimpas = cleanUrls([...imagensExistentes, ...novasImagensURL]);
    const dadosAtualizados = {
      ...bodyToValidate,
      cidadeId: cidadeIdParaSalvar, // 🔒 APLICA A NOVA CIDADE (SE SUPER ADMIN) OU MANTÉM A ANTIGA
      latitude,
      longitude,
      imagem: todasImagensLimpas.length > 0 ? todasImagensLimpas[0] : '',
      imagens: todasImagensLimpas,
      tipo: config.tipoNome,
      updatedAt: new Date().toISOString()
    };

    await docRef.update(dadosAtualizados);
    res.status(200).json({ id, ...dadosAtualizados });
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    if (uploadedFilePaths.length > 0 && bucket) {
      for (const filePath of uploadedFilePaths) { try { await bucket.file(filePath).delete(); } catch (e) {} }
    }
    res.status(500).json({ error: 'Erro ao atualizar item' });
  }
};

// ==========================================
// 5. DELETE (Excluir Item) - BLINDADO COM LOGS
// ==========================================
const deletarItem = async (req, res) => {
  console.log('🗑️ DEBUG deletarItem - Iniciando. Params:', req.params);
  console.log('🗑️ DEBUG deletarItem - User:', req.user ? { role: req.user.role, cidadeId: req.user.cidadeId } : 'Sem user');
  
  try {
    const { tipo, id } = req.params;
    const config = colecoesMap[tipo];

    if (!config || !id) {
      console.error('❌ Parâmetros inválidos:', { tipo, id });
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }

    const docRef = db.collection(config.colecao).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.warn('⚠️ Documento não encontrado:', id);
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const dados = docSnap.data();
    console.log('🗑️ DEBUG deletarItem - Cidade do item:', dados.cidadeId);

    if (req.user && (req.user.role === 'city_admin' || req.user.role === 'editor')) {
      if (dados.cidadeId !== req.user.cidadeId) {
        console.error('❌ Bloqueio de exclusão: cidadeId não corresponde.', {
          userCidade: req.user.cidadeId,
          itemCidade: dados.cidadeId
        });
        return res.status(403).json({ error: 'Acesso negado: Você não pode excluir itens desta cidade.' });
      }
    }

    if (Array.isArray(dados.imagens) && bucket) {
      console.log('🗑️ DEBUG deletarItem - Tentando excluir imagens do Storage...');
      for (const url of dados.imagens) {
        const filePath = extractFilePath(url);
        if (filePath) {
          try {
            await bucket.file(filePath).delete();
          } catch (error) {
            console.warn('⚠️ Falha ao excluir imagem do storage (ignorando):', filePath, error.message);
          }
        }
      }
    }

    console.log('🗑️ DEBUG deletarItem - Excluindo documento do Firestore...');
    await docRef.delete();
    console.log('✅ DEBUG deletarItem - Exclusão concluída com sucesso!');
    
    res.status(200).json({ message: 'Item excluído com sucesso!' });
  } catch (error) {
    console.error('💥 ERRO CRÍTICO ao excluir item:', error);
    res.status(500).json({ error: 'Erro interno ao excluir item', detalhes: error.message });
  }
};

module.exports = { login, listarItens, criarItem, atualizarItem, deletarItem };