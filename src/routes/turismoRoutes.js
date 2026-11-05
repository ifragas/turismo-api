const router = require('express').Router();
const controller = require('../controllers/turismoController');
const { authenticateToken } = require('../middlewares/authMiddleware');
const upload = require('../config/multerConfig');

// Rota de Login
router.post('/login', controller.login);

// Rotas Dinâmicas de Conteúdo Turístico
router.get('/:tipo', controller.listarItens);
router.post('/:tipo', authenticateToken, upload.array('imagens', 10), controller.criarItem);
router.put('/:tipo/:id', authenticateToken, upload.array('imagens', 10), controller.atualizarItem);
router.delete('/:tipo/:id', authenticateToken, controller.deletarItem);

module.exports = router;