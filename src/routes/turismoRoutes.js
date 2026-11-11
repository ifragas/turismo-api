const router = require('express').Router();
const controller = require('../controllers/turismoController');
const eventosController = require('../controllers/eventosController');
const { authenticateToken } = require('../middlewares/authMiddleware');
const upload = require('../config/multerConfig');

// Rota de Login
router.post('/login', controller.login);

// ============================================
// EVENTOS (devem vir ANTES das rotas dinâmicas)
// ============================================
router.get('/eventos', eventosController.listarEventos);
router.get('/eventos/:id', eventosController.buscarEvento);
router.post('/eventos', authenticateToken, upload.array('imagens', 10), eventosController.criarEvento);
router.put('/eventos/:id', authenticateToken, upload.array('imagens', 10), eventosController.atualizarEvento);
router.delete('/eventos/:id', authenticateToken, eventosController.deletarEvento);

// ============================================
// Rotas Dinâmicas de Conteúdo Turístico
// ============================================
router.get('/:tipo', controller.listarItens);
router.post('/:tipo', authenticateToken, upload.array('imagens', 10), controller.criarItem);
router.put('/:tipo/:id', authenticateToken, upload.array('imagens', 10), controller.atualizarItem);
router.delete('/:tipo/:id', authenticateToken, controller.deletarItem);

module.exports = router;