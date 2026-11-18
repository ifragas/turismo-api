// src/middlewares/authMiddleware.js
const { admin } = require('../config/firebase');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Erro ao verificar token:', error.message);
    return res.status(403).json({ error: 'Token inválido ou expirado.' });
  }
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) { req.user = null; return next(); }
  try { req.user = await admin.auth().verifyIdToken(token); } catch (error) { req.user = null; }
  next();
};

const requireRole = (allowedRoles, cidadeIdParam = null) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) return res.status(401).json({ error: 'Acesso negado. Faça login.' });
    if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: 'Acesso negado: Permissão insuficiente.' });

    if ((user.role === 'city_admin' || user.role === 'editor') && cidadeIdParam) {
      // 🚨 CORREÇÃO CRÍTICA: Usar optional chaining (?.) no req.body.
      // Requisições DELETE geralmente não têm body, então req.body é undefined.
      let rawTarget = req.params[cidadeIdParam] || req.body?.[cidadeIdParam] || req.query[cidadeIdParam] || user.cidadeId;

      // Se for um array (comum em FormData duplicado), pega o primeiro elemento
      let targetCity = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;

      // Normaliza para minúsculas e remove espaços
      if (typeof targetCity === 'string') targetCity = targetCity.toLowerCase().trim();
      const userCityNormalized = typeof user.cidadeId === 'string' ? user.cidadeId.toLowerCase().trim() : user.cidadeId;

      // Validação
      if (targetCity && userCityNormalized !== targetCity) {
        return res.status(403).json({
          error: `Acesso negado: Você só pode gerenciar a cidade "${user.cidadeId}". (Recebido: ${rawTarget})`
        });
      }
    }
    next();
  };
};

module.exports = { authenticateToken, optionalAuth, requireRole };