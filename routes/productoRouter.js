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
const uploadProductFiles = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'imagen', maxCount: 1 }
]);

const recibirArchivosProducto = (req, res, next) => {
  uploadProductFiles(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const mensaje = error.code === 'LIMIT_FILE_SIZE'
        ? 'La imagen no debe superar los 5 MB.'
        : 'No se pudo procesar el archivo. Usa el campo image o imagen y envía solo una imagen.';

      return res.status(400).json({
        mensaje,
        error: error.message
      });
    }

    if (error) {
      return next(error);
    }

    return next();
  });
};

router.get('/producto', obtenerProductos);
router.get('/buscarproducto', buscarProductos);
router.post('/registrarproducto', recibirArchivosProducto, registrarProducto);

router.put('/producto/:id', recibirArchivosProducto, actualizarProducto);

router.patch('/producto/:id', recibirArchivosProducto, actualizarProducto);

router.delete('/producto/:id', eliminarProducto);
router.delete('/eliminarproducto/:id', eliminarProducto);

export default router;