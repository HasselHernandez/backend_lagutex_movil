import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import db from '../firebase.js';

const scrypt = promisify(scryptCallback);
const USUARIOS = 'usuario';
const PRODUCTOS = 'productos';
const CAMPOS_DIRECCION = ['municipio', 'barrio', 'departamento', 'direccion'];
const CAMPOS_PERFIL = ['nombres', 'apellidos', 'cedula', 'correo', 'telefono'];

const serializarUsuario = (id, datos) => {
  const { contrasena, contrasena_hash, ...usuario } = datos;
  return { ...usuario, id };
};

const normalizarTexto = (valor) => (
  typeof valor === 'string' ? valor.trim() : ''
);

const validarDirecciones = (direcciones) => (
  Array.isArray(direcciones) &&
  direcciones.every((direccion) =>
    direccion &&
    typeof direccion === 'object' &&
    !Array.isArray(direccion) &&
    CAMPOS_DIRECCION.every((campo) => normalizarTexto(direccion[campo]))
  )
);

const validarPerfil = (datos, { requeridos = false } = {}) => {
  for (const campo of CAMPOS_PERFIL) {
    if (requeridos && !normalizarTexto(datos[campo])) {
      return `El campo ${campo} es obligatorio.`;
    }

    if (datos[campo] !== undefined && !normalizarTexto(datos[campo])) {
      return `El campo ${campo} no puede estar vacío.`;
    }
  }

  if (datos.correo !== undefined &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarTexto(datos.correo))) {
    return 'El correo no tiene un formato válido.';
  }

  return null;
};

const hashContrasena = async (contrasena) => {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(contrasena, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
};

const buscarUsuarioDuplicado = async (campo, valor, excluirId) => {
  const snapshot = await db.collection(USUARIOS)
    .where(campo, '==', valor)
    .get();

  return snapshot.docs.find((doc) => doc.id !== excluirId);
};

export const obtenerUsuarios = async (req, res) => {
  try {
    const snapshot = await db.collection(USUARIOS).get();
    return res.status(200).json(
      snapshot.docs.map((doc) => serializarUsuario(doc.id, doc.data()))
    );
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return res.status(500).json({
      mensaje: 'Error al obtener los usuarios.',
      error: error.message
    });
  }
};

export const registrarUsuario = async (req, res) => {
  const datos = req.body || {};
  const errorPerfil = validarPerfil(datos, { requeridos: true });
  const contrasena = datos.contrasena ?? datos['contraseña'];

  if (errorPerfil) {
    return res.status(400).json({ mensaje: errorPerfil });
  }

  if (typeof contrasena !== 'string' || contrasena.length < 8) {
    return res.status(400).json({
      mensaje: 'La contraseña es obligatoria y debe tener al menos 8 caracteres.'
    });
  }

  if (datos.direcciones !== undefined && !validarDirecciones(datos.direcciones)) {
    return res.status(400).json({
      mensaje: 'Cada dirección debe incluir municipio, barrio, departamento y direccion.'
    });
  }

  if (datos.metodo_pago !== undefined &&
      (!Array.isArray(datos.metodo_pago) || datos.metodo_pago.length > 0)) {
    return res.status(400).json({
      mensaje: 'Por ahora metodo_pago debe ser un arreglo vacío.'
    });
  }

  try {
    const correo = normalizarTexto(datos.correo).toLowerCase();
    const cedula = normalizarTexto(datos.cedula);
    const [correoDuplicado, cedulaDuplicada] = await Promise.all([
      buscarUsuarioDuplicado('correo', correo),
      buscarUsuarioDuplicado('cedula', cedula)
    ]);

    if (correoDuplicado) {
      return res.status(409).json({ mensaje: 'Ya existe un usuario con ese correo.' });
    }

    if (cedulaDuplicada) {
      return res.status(409).json({ mensaje: 'Ya existe un usuario con esa cédula.' });
    }

    const usuarioRef = db.collection(USUARIOS).doc();
    const nuevoUsuario = {
      nombres: normalizarTexto(datos.nombres),
      apellidos: normalizarTexto(datos.apellidos),
      cedula,
      correo,
      contrasena_hash: await hashContrasena(contrasena),
      telefono: normalizarTexto(datos.telefono),
      rol: 'Cliente',
      direcciones: datos.direcciones || [],
      metodo_pago: [],
      carrito: []
    };

    await usuarioRef.set(nuevoUsuario);

    return res.status(201).json({
      mensaje: 'Usuario registrado correctamente.',
      usuario: serializarUsuario(usuarioRef.id, nuevoUsuario)
    });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    return res.status(500).json({
      mensaje: 'Error al registrar el usuario.',
      error: error.message
    });
  }
};

export const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const datos = req.body || {};

  if (datos.rol !== undefined) {
    return res.status(403).json({
      mensaje: 'El rol no se puede modificar desde esta ruta.'
    });
  }

  if (datos.contrasena !== undefined || datos['contraseña'] !== undefined) {
    const contrasena = datos.contrasena ?? datos['contraseña'];
    if (typeof contrasena !== 'string' || contrasena.length < 8) {
      return res.status(400).json({
        mensaje: 'La contraseña debe tener al menos 8 caracteres.'
      });
    }
  }

  const errorPerfil = validarPerfil(datos);
  if (errorPerfil) {
    return res.status(400).json({ mensaje: errorPerfil });
  }

  if (datos.direcciones !== undefined && !validarDirecciones(datos.direcciones)) {
    return res.status(400).json({
      mensaje: 'Cada dirección debe incluir municipio, barrio, departamento y direccion.'
    });
  }

  if (datos.metodo_pago !== undefined &&
      (!Array.isArray(datos.metodo_pago) || datos.metodo_pago.length > 0)) {
    return res.status(400).json({
      mensaje: 'Por ahora metodo_pago debe ser un arreglo vacío.'
    });
  }

  if (datos.carrito !== undefined) {
    return res.status(400).json({
      mensaje: 'El carrito se modifica mediante sus rutas específicas.'
    });
  }

  try {
    const docRef = db.collection(USUARIOS).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    const actualizacion = {};
    for (const campo of CAMPOS_PERFIL) {
      if (datos[campo] !== undefined) {
        actualizacion[campo] = normalizarTexto(datos[campo]);
      }
    }

    if (actualizacion.correo) {
      actualizacion.correo = actualizacion.correo.toLowerCase();
    }

    for (const campo of ['correo', 'cedula']) {
      if (actualizacion[campo] !== undefined) {
        const duplicado = await buscarUsuarioDuplicado(campo, actualizacion[campo], id);
        if (duplicado) {
          return res.status(409).json({
            mensaje: `Ya existe un usuario con ese ${campo === 'correo' ? 'correo' : 'número de cédula'}.`
          });
        }
      }
    }

    if (datos.direcciones !== undefined) {
      actualizacion.direcciones = datos.direcciones;
    }

    if (datos.metodo_pago !== undefined) {
      actualizacion.metodo_pago = [];
    }

    const contrasena = datos.contrasena ?? datos['contraseña'];
    if (contrasena !== undefined) {
      actualizacion.contrasena_hash = await hashContrasena(contrasena);
    }

    if (Object.keys(actualizacion).length === 0) {
      return res.status(400).json({ mensaje: 'No se enviaron campos para actualizar.' });
    }

    await docRef.update(actualizacion);
    const usuarioActualizado = await docRef.get();

    return res.status(200).json({
      mensaje: 'Usuario actualizado correctamente.',
      usuario: serializarUsuario(usuarioActualizado.id, usuarioActualizado.data())
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    return res.status(500).json({
      mensaje: 'Error al actualizar el usuario.',
      error: error.message
    });
  }
};

export const eliminarUsuario = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ mensaje: 'El ID del usuario es obligatorio.' });
  }

  try {
    const docRef = db.collection(USUARIOS).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    await docRef.delete();
    return res.status(200).json({
      mensaje: 'Usuario eliminado correctamente.',
      id
    });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    return res.status(500).json({
      mensaje: 'Error al eliminar el usuario.',
      error: error.message
    });
  }
};

export const buscarUsuarios = async (req, res) => {
  const { q } = req.query;

  if (typeof q !== 'string' || q.trim() === '') {
    return res.status(400).json({
      mensaje: 'Debes enviar un término de búsqueda (parámetro q).'
    });
  }

  try {
    const termino = q.trim().toLocaleLowerCase();
    const snapshot = await db.collection(USUARIOS).get();
    const usuarios = snapshot.docs
      .map((doc) => serializarUsuario(doc.id, doc.data()))
      .filter((usuario) =>
        ['nombres', 'apellidos', 'cedula', 'correo', 'telefono', 'rol']
          .some((campo) =>
            String(usuario[campo] ?? '').toLocaleLowerCase().includes(termino)
          )
      );

    return res.status(200).json(usuarios);
  } catch (error) {
    console.error('Error al buscar usuarios:', error);
    return res.status(500).json({
      mensaje: 'Error al buscar los usuarios.',
      error: error.message
    });
  }
};

export const agregarProductoAlCarrito = async (req, res) => {
  const { id } = req.params;
  const productoId = normalizarTexto(req.body?.producto_id);
  const cantidad = Number(req.body?.cantidad ?? 1);

  if (!productoId || !Number.isInteger(cantidad) || cantidad < 1) {
    return res.status(400).json({
      mensaje: 'producto_id es obligatorio y cantidad debe ser un entero mayor que cero.'
    });
  }

  try {
    const usuarioRef = db.collection(USUARIOS).doc(id);
    const productoRef = db.collection(PRODUCTOS).doc(productoId);
    const resultado = await db.runTransaction(async (transaction) => {
      const [usuarioDoc, productoDoc] = await Promise.all([
        transaction.get(usuarioRef),
        transaction.get(productoRef)
      ]);

      if (!usuarioDoc.exists) {
        return { error: 'Usuario no encontrado.', status: 404 };
      }

      if (!productoDoc.exists) {
        return { error: 'Producto no encontrado.', status: 404 };
      }

      const producto = productoDoc.data();
      const carrito = usuarioDoc.data().carrito || [];
      const indice = carrito.findIndex((item) => item.producto_id === productoId);
      const cantidadActual = indice === -1 ? 0 : carrito[indice].cantidad;
      const cantidadTotal = cantidadActual + cantidad;

      if (Number.isFinite(producto.stock) && cantidadTotal > producto.stock) {
        return {
          error: `La cantidad solicitada supera el stock disponible (${producto.stock}).`,
          status: 400
        };
      }

      const item = {
        producto_id: productoId,
        nombre: producto.nombre,
        precio: producto.precio,
        image: producto.image || '',
        cantidad: cantidadTotal
      };

      if (producto.categoria_id !== undefined) {
        item.categoria_id = producto.categoria_id;
      }

      const nuevoCarrito = [...carrito];
      if (indice === -1) {
        nuevoCarrito.push(item);
      } else {
        nuevoCarrito[indice] = item;
      }

      transaction.update(usuarioRef, { carrito: nuevoCarrito });
      return { carrito: nuevoCarrito };
    });

    if (resultado.error) {
      return res.status(resultado.status).json({ mensaje: resultado.error });
    }

    return res.status(200).json({
      mensaje: 'Producto agregado al carrito.',
      carrito: resultado.carrito
    });
  } catch (error) {
    console.error('Error al agregar producto al carrito:', error);
    return res.status(500).json({
      mensaje: 'Error al agregar el producto al carrito.',
      error: error.message
    });
  }
};

export const quitarProductoDelCarrito = async (req, res) => {
  const { id, productoId } = req.params;

  try {
    const usuarioRef = db.collection(USUARIOS).doc(id);
    const resultado = await db.runTransaction(async (transaction) => {
      const usuarioDoc = await transaction.get(usuarioRef);

      if (!usuarioDoc.exists) {
        return { error: 'Usuario no encontrado.', status: 404 };
      }

      const carrito = usuarioDoc.data().carrito || [];
      const nuevoCarrito = carrito.filter((item) => item.producto_id !== productoId);

      if (nuevoCarrito.length === carrito.length) {
        return { error: 'El producto no está en el carrito.', status: 404 };
      }

      transaction.update(usuarioRef, { carrito: nuevoCarrito });
      return { carrito: nuevoCarrito };
    });

    if (resultado.error) {
      return res.status(resultado.status).json({ mensaje: resultado.error });
    }

    return res.status(200).json({
      mensaje: 'Producto eliminado del carrito.',
      carrito: resultado.carrito
    });
  } catch (error) {
    console.error('Error al quitar producto del carrito:', error);
    return res.status(500).json({
      mensaje: 'Error al quitar el producto del carrito.',
      error: error.message
    });
  }
};
