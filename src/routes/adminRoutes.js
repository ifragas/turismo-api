// src/routes/adminRoutes.js
const router = require('express').Router();
const adminCidadesController = require('../controllers/adminCidadesController');
const adminUsuariosController = require('../controllers/adminUsuariosController'); // <-- NOVO
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

// Middleware composto: Exige login E exige que a role seja 'super_admin'
const superAdminOnly = [
  authenticateToken, 
  requireRole(['super_admin'])
];

// ==========================================
// Rotas de Gestão de Cidades
// ==========================================
router.get('/cidades', ...superAdminOnly, adminCidadesController.getCidades);
router.post('/cidades', ...superAdminOnly, adminCidadesController.createCidade);
router.put('/cidades/:slug', ...superAdminOnly, adminCidadesController.updateCidade);
router.delete('/cidades/:slug', ...superAdminOnly, adminCidadesController.deleteCidade);

// ==========================================
// Rotas de Gestão de Usuários (NOVO)
// ==========================================
router.get('/usuarios', ...superAdminOnly, adminUsuariosController.getUsuarios);
router.post('/usuarios', ...superAdminOnly, adminUsuariosController.createUsuario);
router.put('/usuarios/:uid', ...superAdminOnly, adminUsuariosController.updateUsuario);
router.delete('/usuarios/:uid', ...superAdminOnly, adminUsuariosController.deleteUsuario);

module.exports = router;