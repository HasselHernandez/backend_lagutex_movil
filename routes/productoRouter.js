import express from 'express';
import multer from 'multer';
import {
  obtenerProductos,
  registrarProducto,
  actualizarProducto,
  eliminarProducto,
  buscarProductos
} from '../controllers/productos.controller.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/producto', obtenerProductos);
router.get('/buscarproducto', buscarProductos);
router.post(
  '/registrarproducto',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'imagen', maxCount: 1 }
  ]),
  registrarProducto
);

router.put(
  '/producto/:id',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'imagen', maxCount: 1 }
  ]),
  actualizarProducto
);

router.patch(
  '/producto/:id',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'imagen', maxCount: 1 }
  ]),
  actualizarProducto
);

router.delete('/producto/:id', eliminarProducto);
router.delete('/eliminarproducto/:id', eliminarProducto);

export default router;