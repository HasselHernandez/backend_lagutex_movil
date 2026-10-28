import express from 'express';
import {
  obtenerResenas,
  obtenerResena,
  registrarResena,
  actualizarResena,
  eliminarResena,
  buscarResenas,
  exportarResenasCSV,
} from '../controllers/resenas.controller.js';

const router = express.Router();



router.get('/resena/csv', exportarResenasCSV);
router.get('/resena', obtenerResenas);
router.get('/buscarresena', buscarResenas);



router.post('/registrarresena', registrarResena);


router.get('/resena/:id', obtenerResena);
router.put('/resena/:id', actualizarResena);
router.patch('/resena/:id', actualizarResena);
router.delete('/resena/:id', eliminarResena);

export default router;
