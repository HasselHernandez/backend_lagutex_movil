import express from 'express';
import { obtenerEstadisticas } from '../controllers/estadisticas.controller.js';
import {
  exportarEstadisticasExcel,
  exportarEstadisticasPDF
} from '../controllers/exportacion.controller.js';

const router = express.Router();

router.get('/estadisticas', obtenerEstadisticas);
router.get('/estadisticas/exportar/excel', exportarEstadisticasExcel);
router.get('/estadisticas/exportar/pdf', exportarEstadisticasPDF);


export default router;