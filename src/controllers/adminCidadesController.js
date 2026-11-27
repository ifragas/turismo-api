const { db, bucket } = require('../config/firebase');

// ==========================================
// UTILITÁRIOS DE UPLOAD
// ==========================================
const cleanFileName = (originalName) => 
  originalName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');

const extractFilePath = (url) => {
  if (!url) return null;
  try {
    const match = url.match(/\/o\/(.+?)(\?|$)/);
    if (match && match[1]) return decodeURIComponent(match[1]);
  } catch (e) { /* ignora */ }
  return null;
};

const enviarArquivo = async (file, slug, subpasta) => {
  if (!file || !bucket) return null;
  const cleanedName = cleanFileName(file.originalname);
  const fileName = `${Date.now()}_${cleanedName}`;
  const filePath = `imagens/cidades/${subpasta}/${slug}/${fileName}`;
  await bucket.file(filePath).save(file.buffer, { 
    metadata: { contentType: file.mimetype } 
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
};

const deletarImagemAntiga = async (urlAntiga) => {
  if (!urlAntiga || !bucket) return;
  const filePath = extractFilePath(urlAntiga);
  if (filePath) {
    try { await bucket.file(filePath).delete(); } catch (e) { /* ignora */ }
  }
};

const paraBooleano = (valor, padrao = false) => {
  if (valor === undefined || valor === null || valor === '') return padrao;
  if (typeof valor === 'boolean') return valor;
  return String(valor).trim().toLowerCase() === 'true';
};

const extrairBody = (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
};

// ==========================================
// 1. LISTAR TODAS AS CIDADES
// ==========================================
const getCidades = async (req, res) => {
  try {
    const snapshot = await db.collection('cidades').orderBy('nome', 'asc').get();
    const cidades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(cidades);
  } catch (error) {
    console.error('Erro ao listar cidades:', error);
    res.status(500).json({ error: 'Erro interno ao buscar cidades.' });
  }
};

// ==========================================
// 2. CRIAR NOVA CIDADE
// ==========================================
const createCidade = async (req, res) => {
  const uploadedFiles = [];
  try {
    const body = extrairBody(req);
    const { slug, nome, estado, corPrimaria, corSecundaria, logoUrl, heroImageUrl, splashImageUrl, temAppProprio, publicaNoSmartTurismo } = body;

    if (!slug || !nome || !estado) {
      return res.status(400).json({ error: 'Campos obrigatórios: slug, nome e estado.' });
    }

    const slugNormalizado = String(slug).toLowerCase().trim().replace(/\s+/g, '_');

    const docRef = db.collection('cidades').doc(slugNormalizado);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return res.status(409).json({ error: 'Já existe uma cidade com este slug.' });
    }

    // 🚨 Processa uploads (req.files é um objeto { splash: [...], hero: [...] })
    let splashUrlFinal = splashImageUrl || '';
    let heroUrlFinal = heroImageUrl || '';

    if (req.files?.splash?.[0]) {
      splashUrlFinal = await enviarArquivo(req.files.splash[0], slugNormalizado, 'splash');
      uploadedFiles.push(`imagens/cidades/splash/${slugNormalizado}/${cleanFileName(req.files.splash[0].originalname)}`);
    }

    if (req.files?.hero?.[0]) {
      heroUrlFinal = await enviarArquivo(req.files.hero[0], slugNormalizado, 'hero');
      uploadedFiles.push(`imagens/cidades/hero/${slugNormalizado}/${cleanFileName(req.files.hero[0].originalname)}`);
    }

    const novaCidade = {
      nome: String(nome).trim(),
      estado: String(estado).trim().toUpperCase(),
      slug: slugNormalizado,
      corPrimaria: corPrimaria || '#10B981',
      corSecundaria: corSecundaria || '#F59E0B',
      logoUrl: logoUrl || '',
      heroImageUrl: heroUrlFinal,
      splashImageUrl: splashUrlFinal,
      temAppProprio: paraBooleano(temAppProprio, false),
      publicaNoSmartTurismo: paraBooleano(publicaNoSmartTurismo, true),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docRef.set(novaCidade);
    res.status(201).json({ message: 'Cidade criada com sucesso!', cidade: novaCidade });
  } catch (error) {
    console.error('Erro ao criar cidade:', error);
    // Rollback: remove arquivos enviados se deu erro
    if (bucket) {
      for (const p of uploadedFiles) { try { await bucket.file(p).delete(); } catch (e) {} }
    }
    res.status(500).json({ error: 'Erro interno ao criar cidade.' });
  }
};

// ==========================================
// 3. ATUALIZAR CIDADE
// ==========================================
const updateCidade = async (req, res) => {
  const uploadedFiles = [];
  try {
    const { slug } = req.params;
    const body = extrairBody(req);
    const { nome, estado, corPrimaria, corSecundaria, logoUrl, heroImageUrl, splashImageUrl, temAppProprio, publicaNoSmartTurismo } = body;

    const docRef = db.collection('cidades').doc(slug);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Cidade não encontrada.' });
    }

    const dadosAntigos = docSnap.data();

    // 🚨 Processa uploads e apaga antigos se houver novos
    let novaSplashUrl = null;
    let novoHeroUrl = null;

    if (req.files?.splash?.[0]) {
      novaSplashUrl = await enviarArquivo(req.files.splash[0], slug, 'splash');
      uploadedFiles.push(`imagens/cidades/splash/${slug}/${cleanFileName(req.files.splash[0].originalname)}`);
      await deletarImagemAntiga(dadosAntigos.splashImageUrl);
    }

    if (req.files?.hero?.[0]) {
      novoHeroUrl = await enviarArquivo(req.files.hero[0], slug, 'hero');
      uploadedFiles.push(`imagens/cidades/hero/${slug}/${cleanFileName(req.files.hero[0].originalname)}`);
      await deletarImagemAntiga(dadosAntigos.heroImageUrl);
    }

    const dadosAtualizados = {
      ...(nome !== undefined && { nome: String(nome).trim() }),
      ...(estado !== undefined && { estado: String(estado).trim().toUpperCase() }),
      ...(corPrimaria !== undefined && { corPrimaria }),
      ...(corSecundaria !== undefined && { corSecundaria }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(novoHeroUrl ? { heroImageUrl: novoHeroUrl } : (heroImageUrl !== undefined ? { heroImageUrl } : {})),
      ...(novaSplashUrl ? { splashImageUrl: novaSplashUrl } : (splashImageUrl !== undefined ? { splashImageUrl } : {})),
      ...(temAppProprio !== undefined && { temAppProprio: paraBooleano(temAppProprio, dadosAntigos.temAppProprio) }),
      ...(publicaNoSmartTurismo !== undefined && { publicaNoSmartTurismo: paraBooleano(publicaNoSmartTurismo, dadosAntigos.publicaNoSmartTurismo) }),
      updatedAt: new Date().toISOString()
    };

    await docRef.update(dadosAtualizados);
    res.status(200).json({ 
      message: 'Cidade atualizada com sucesso!', 
      cidade: { id: slug, ...dadosAntigos, ...dadosAtualizados } 
    });
  } catch (error) {
    console.error('Erro ao atualizar cidade:', error);
    // Rollback
    if (bucket) {
      for (const p of uploadedFiles) { try { await bucket.file(p).delete(); } catch (e) {} }
    }
    res.status(500).json({ error: 'Erro interno ao atualizar cidade.' });
  }
};

// ==========================================
// 4. EXCLUIR CIDADE
// ==========================================
const deleteCidade = async (req, res) => {
  try {
    const { slug } = req.params;

    const docRef = db.collection('cidades').doc(slug);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Cidade não encontrada.' });
    }

    const dados = docSnap.data();
    await deletarImagemAntiga(dados.splashImageUrl);
    await deletarImagemAntiga(dados.heroImageUrl);

    await docRef.delete();
    res.status(200).json({ message: 'Cidade excluída com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir cidade:', error);
    res.status(500).json({ error: 'Erro interno ao excluir cidade.' });
  }
};

module.exports = {
  getCidades,
  createCidade,
  updateCidade,
  deleteCidade
};