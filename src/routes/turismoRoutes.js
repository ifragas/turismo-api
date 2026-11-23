const router = require('express').Router();
const controller = require('../controllers/turismoController');
const eventosController = require('../controllers/eventosController');
// 🚨 NOVO: Importamos o controller de cidades para usar a rota pública aqui
const adminCidadesController = require('../controllers/adminCidadesController');

const { authenticateToken, optionalAuth, requireRole } = require('../middlewares/authMiddleware');
const upload = require('../config/multerConfig');

// Rota de Login (Pública)
router.post('/login', controller.login);

// ============================================
// ROTAS PÚBLICAS ESPECÍFICAS
// ============================================
// 🚨 NOVO: Rota pública para listar cidades. 
// DEVE vir ANTES de '/:tipo', senão o Express acha que 'cidades' é um tipo de item turístico.
router.get('/cidades', optionalAuth, adminCidadesController.getCidades);

// ============================================
// EVENTOS
// ============================================
router.get('/eventos', optionalAuth, eventosController.listarEventos);
router.get('/eventos/:id', optionalAuth, eventosController.buscarEvento);

router.post(
  '/eventos',
  authenticateToken,
  upload.array('imagens', 10),
  requireRole(['super_admin', 'city_admin', 'editor'], 'cidadeId'),
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

router.post(
  '/:tipo',
  authenticateToken,
  upload.array('imagens', 10),
  requireRole(['super_admin', 'city_admin', 'editor'], 'cidadeId'),
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