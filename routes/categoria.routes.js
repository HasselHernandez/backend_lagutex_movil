import express from 'express';
import multer from 'multer';
import {
  exportarCategoriasCSV
  } from '../controllers/categoria.controller.js';

  const router = express.Router();

router.get('/categoria/csv', exportarCategoriasCSV);

export default router;
