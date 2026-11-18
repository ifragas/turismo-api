// src/controllers/adminUsuariosController.js
const { admin } = require('../config/firebase');

// 1. LISTAR TODOS OS USUÁRIOS
const getUsuarios = async (req, res) => {
  try {
    const listUsersResult = await admin.auth().listUsers(1000); // Pega até 1000 usuários
    
    const usuarios = listUsersResult.users.map(user => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Sem nome',
      emailVerified: user.emailVerified,
      role: user.customClaims?.role || 'sem_role',
      cidadeId: user.customClaims?.cidadeId || null,
      createdAt: user.metadata.creationTime
    }));

    res.status(200).json(usuarios);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro interno ao buscar usuários.' });
  }
};

// 2. CRIAR NOVO USUÁRIO
const createUsuario = async (req, res) => {
  try {
    const { email, password, displayName, role, cidadeId } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Campos obrigatórios: email, password e role.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    // Cria o usuário no Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase().trim(),
      password,
      displayName: displayName || email.split('@')[0],
      emailVerified: true // No MVP, já marcamos como verificado
    });

    // Atribui as Custom Claims (RBAC)
    const claims = { role };
    if (cidadeId) claims.cidadeId = cidadeId.toLowerCase().trim();
    else claims.cidadeId = null;

    await admin.auth().setCustomUserClaims(userRecord.uid, claims);

    res.status(201).json({ 
      message: 'Usuário criado com sucesso!', 
      uid: userRecord.uid,
      claims 
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
    }
    res.status(500).json({ error: 'Erro interno ao criar usuário.' });
  }
};

// 3. ATUALIZAR USUÁRIO (Apenas Claims e Dados Básicos)
const updateUsuario = async (req, res) => {
  try {
    const { uid } = req.params;
    const { email, displayName, role, cidadeId } = req.body;

    // Atualiza dados básicos (email/nome) se enviados
    const updateData = {};
    if (email) updateData.email = email.toLowerCase().trim();
    if (displayName) updateData.displayName = displayName;

    if (Object.keys(updateData).length > 0) {
      await admin.auth().updateUser(uid, updateData);
    }

    // Atualiza as Custom Claims (Permissões)
    const claims = { role };
    if (cidadeId) claims.cidadeId = cidadeId.toLowerCase().trim();
    else claims.cidadeId = null;

    await admin.auth().setCustomUserClaims(uid, claims);

    res.status(200).json({ message: 'Usuário atualizado com sucesso!', claims });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    res.status(500).json({ error: 'Erro interno ao atualizar usuário.' });
  }
};

// 4. EXCLUIR USUÁRIO
const deleteUsuario = async (req, res) => {
  try {
    const { uid } = req.params;

    // 🔒 SEGURANÇA: Impede que o super_admin exclua a si mesmo
    if (uid === req.user.uid) {
      return res.status(403).json({ error: 'Você não pode excluir o seu próprio usuário.' });
    }

    await admin.auth().deleteUser(uid);
    res.status(200).json({ message: 'Usuário excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    res.status(500).json({ error: 'Erro interno ao excluir usuário.' });
  }
};

module.exports = {
  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario
};