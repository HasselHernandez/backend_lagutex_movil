import express from 'express';
import multer from 'multer';
import { obtenerProductos, registrarProducto } from '../controllers/producto.controller.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/producto', obtenerProductos);
router.post(
  '/registrarproducto',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'imagen', maxCount: 1 }
  ]),
  registrarProducto
);

export default router;