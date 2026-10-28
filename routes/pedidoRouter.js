import express from 'express';
import {
  obtenerPedidos,
  obtenerPedido,
  registrarPedido,
  actualizarPedido,
  eliminarPedido,
  buscarPedidos
} from '../controllers/pedidos.controller.js';

const router = express.Router();

router.get('/pedido', obtenerPedidos);
router.get('/buscarpedido', buscarPedidos);
router.post('/registrarpedido', registrarPedido);
router.get('/pedido/:id', obtenerPedido);
router.put('/pedido/:id', actualizarPedido);
router.patch('/pedido/:id', actualizarPedido);
router.delete('/pedido/:id', eliminarPedido);

export default router;
