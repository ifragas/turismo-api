// src/routes/turismoRoutes.js
const router = require('express').Router();
const controller = require('../controllers/turismoController');
const eventosController = require('../controllers/eventosController');

const { authenticateToken, optionalAuth, requireRole } = require('../middlewares/authMiddleware');
const upload = require('../config/multerConfig');

// Rota de Login (Pública)
router.post('/login', controller.login);

// ============================================
// EVENTOS
// ============================================
router.get('/eventos', optionalAuth, eventosController.listarEventos);
router.get('/eventos/:id', optionalAuth, eventosController.buscarEvento);

// 🚨 CORREÇÃO: upload.array AGORA vem ANTES do requireRole
router.post(
  '/eventos',
  authenticateToken,
  upload.array('imagens', 10), // 1. Processa o FormData primeiro
  requireRole(['super_admin', 'city_admin', 'editor'], 'cidadeId'), // 2. Agora req.body.cidadeId existe!
  eventosController.criarEvento
);

router.put(
  '/eventos/:id',
  authenticateToken,
  upload.array('imagens', 10),
  requireRole(['super_admin', 'city_admin', 'editor'], 'cidadeId'),
  eventosController.atualizarEvento
);

router.delete(
  '/eventos/:id',
  authenticateToken,
  requireRole(['super_admin', 'city_admin', 'editor'], 'cidadeId'),
  eventosController.deletarEvento
);

// ============================================
// Rotas Dinâmicas de Conteúdo Turístico
// ============================================
router.get('/:tipo', optionalAuth, controller.listarItens);

// 🚨 CORREÇÃO: upload.array AGORA vem ANTES do requireRole
router.post(
  '/:tipo',
  authenticateToken,
  upload.array('imagens', 10), // 1. Processa o FormData primeiro
  requireRole(['super_admin', 'city_admin', 'editor'], 'cidadeId'), // 2. Agora req.body.cidadeId existe!
  controller.criarItem
);

router.put(
  '/:tipo/:id',
  authenticateToken,
  upload.array('imagens', 10),
  requireRole(['super_admin', 'city_admin', 'editor'], 'cidadeId'),
  controller.atualizarItem
);

router.delete(
  '/:tipo/:id',
  authenticateToken,
  requireRole(['super_admin', 'city_admin', 'editor'], 'cidadeId'),
  controller.deletarItem
);

module.exports = router;