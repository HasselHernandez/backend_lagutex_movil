import express from 'express';
import {
  obtenerUsuarios,
  registrarUsuario,
  actualizarUsuario,
  eliminarUsuario,
  buscarUsuarios,
  agregarProductoAlCarrito,
  quitarProductoDelCarrito
} from '../controllers/usuarios.controller.js';

const router = express.Router();

router.get('/usuario', obtenerUsuarios);
router.get('/buscarusuario', buscarUsuarios);
router.post('/registrarusuario', registrarUsuario);
router.post('/usuario/:id/carrito', agregarProductoAlCarrito);
router.delete('/usuario/:id/carrito/:productoId', quitarProductoDelCarrito);
router.put('/usuario/:id', actualizarUsuario);
router.patch('/usuario/:id', actualizarUsuario);
router.delete('/usuario/:id', eliminarUsuario);

export default router;
