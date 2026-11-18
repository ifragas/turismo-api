// src/controllers/adminCidadesController.js
const { db } = require('../config/firebase');

// 1. LISTAR TODAS AS CIDADES
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

// 2. CRIAR NOVA CIDADE
const createCidade = async (req, res) => {
  try {
    const { slug, nome, estado, corPrimaria, corSecundaria, logoUrl, heroImageUrl, temAppProprio, publicaNoSmartTurismo } = req.body;

    if (!slug || !nome || !estado) {
      return res.status(400).json({ error: 'Campos obrigatórios: slug, nome e estado.' });
    }

    // Normaliza o slug para minúsculas e sem espaços
    const slugNormalizado = String(slug).toLowerCase().trim().replace(/\s+/g, '_');

    // Verificar se o slug já existe
    const docRef = db.collection('cidades').doc(slugNormalizado);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return res.status(409).json({ error: 'Já existe uma cidade com este slug.' });
    }

    const novaCidade = {
      nome,
      estado,
      slug: slugNormalizado,
      corPrimaria: corPrimaria || '#10B981',
      corSecundaria: corSecundaria || '#F59E0B',
      logoUrl: logoUrl || '',
      heroImageUrl: heroImageUrl || '',
      temAppProprio: Boolean(temAppProprio),
      publicaNoSmartTurismo: Boolean(publicaNoSmartTurismo),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docRef.set(novaCidade);
    res.status(201).json({ message: 'Cidade criada com sucesso!', cidade: novaCidade });
  } catch (error) {
    console.error('Erro ao criar cidade:', error);
    res.status(500).json({ error: 'Erro interno ao criar cidade.' });
  }
};

// 3. ATUALIZAR CIDADE
const updateCidade = async (req, res) => {
  try {
    const { slug } = req.params;
    const { nome, estado, corPrimaria, corSecundaria, logoUrl, heroImageUrl, temAppProprio, publicaNoSmartTurismo } = req.body;

    const docRef = db.collection('cidades').doc(slug);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Cidade não encontrada.' });
    }

    const dadosAtualizados = {
      ...(nome !== undefined && { nome }),
      ...(estado !== undefined && { estado }),
      ...(corPrimaria !== undefined && { corPrimaria }),
      ...(corSecundaria !== undefined && { corSecundaria }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(heroImageUrl !== undefined && { heroImageUrl }),
      ...(temAppProprio !== undefined && { temAppProprio }),
      ...(publicaNoSmartTurismo !== undefined && { publicaNoSmartTurismo }),
      updatedAt: new Date().toISOString()
    };

    await docRef.update(dadosAtualizados);
    res.status(200).json({ message: 'Cidade atualizada com sucesso!', cidade: { id: slug, ...dadosAtualizados } });
  } catch (error) {
    console.error('Erro ao atualizar cidade:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar cidade.' });
  }
};

// 4. EXCLUIR CIDADE
const deleteCidade = async (req, res) => {
  try {
    const { slug } = req.params;

    const docRef = db.collection('cidades').doc(slug);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Cidade não encontrada.' });
    }

    // ⚠️ NOTA PARA MVP: Em produção, idealmente verificaríamos se existem 
    // itens (pontos turísticos, usuários) vinculados a esta cidade antes de excluir.
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