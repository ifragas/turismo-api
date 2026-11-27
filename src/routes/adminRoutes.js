const router = require('express').Router();
const adminCidadesController = require('../controllers/adminCidadesController');
const adminUsuariosController = require('../controllers/adminUsuariosController');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const upload = require('../config/multerConfig');

const superAdminOnly = [
  authenticateToken, 
  requireRole(['super_admin'])
];

// GET é PÚBLICO
router.get('/cidades', adminCidadesController.getCidades);

// 🚨 MODIFICADO: aceita 'splash' e 'hero' simultaneamente
router.post(
  '/cidades', 
  ...superAdminOnly, 
  upload.fields([
    { name: 'splash', maxCount: 1 },
    { name: 'hero', maxCount: 1 }
  ]),
  adminCidadesController.createCidade
);

router.put(
  '/cidades/:slug', 
  ...superAdminOnly, 
  upload.fields([
    { name: 'splash', maxCount: 1 },
    { name: 'hero', maxCount: 1 }
  ]),
  adminCidadesController.updateCidade
);

router.delete('/cidades/:slug', ...superAdminOnly, adminCidadesController.deleteCidade);

// Usuários
router.get('/usuarios', ...superAdminOnly, adminUsuariosController.getUsuarios);
router.post('/usuarios', ...superAdminOnly, adminUsuariosController.createUsuario);
router.put('/usuarios/:uid', ...superAdminOnly, adminUsuariosController.updateUsuario);
router.delete('/usuarios/:uid', ...superAdminOnly, adminUsuariosController.deleteUsuario);

module.exports = router;