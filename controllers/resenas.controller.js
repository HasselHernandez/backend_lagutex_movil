import db from '../firebase.js';

const RESENAS = 'resenas';
const USUARIOS = 'usuario';
const PRODUCTOS = 'productos';
const PEDIDOS = 'pedidos';

const normalizarTexto = (valor) => (
  typeof valor === 'string' ? valor.trim() : ''
);

const serializarResena = (doc) => ({
  ...doc.data(),
  id: doc.id
});

const validarCalificacion = (valor) => (
  Number.isInteger(Number(valor)) &&
  Number(valor) >= 1 &&
  Number(valor) <= 5
);

const pedidoIncluyeProducto = (pedido, productoId) => (
  Array.isArray(pedido.productos) &&
  pedido.productos.some((producto) =>
    (producto.producto_id ?? producto.productoId ?? producto.id) === productoId
  )
);

const validarCompra = async (usuarioId, productoId) => {
  const pedidos = await db.collection(PEDIDOS)
    .where('usuarioId', '==', usuarioId)
    .get();

  return pedidos.docs.some((pedido) =>
    pedidoIncluyeProducto(pedido.data(), productoId)
  );
};

export const obtenerResenas = async (req, res) => {
  try {
    let consulta = db.collection(RESENAS);
    const productoId = normalizarTexto(req.query.productoId);
    const usuarioId = normalizarTexto(req.query.usuarioId);

    if (productoId) {
      consulta = consulta.where('productoId', '==', productoId);
    }

    if (usuarioId) {
      consulta = consulta.where('usuarioId', '==', usuarioId);
    }

    const snapshot = await consulta.get();
    return res.status(200).json(snapshot.docs.map(serializarResena));
  } catch (error) {
    console.error('Error al obtener reseñas:', error);
    return res.status(500).json({
      mensaje: 'Error al obtener las reseñas.',
      error: error.message
    });
  }
};

export const obtenerResena = async (req, res) => {
  try {
    const documento = await db.collection(RESENAS).doc(req.params.id).get();
    if (!documento.exists) {
      return res.status(404).json({ mensaje: 'Reseña no encontrada.' });
    }

    return res.status(200).json(serializarResena(documento));
  } catch (error) {
    console.error('Error al obtener la reseña:', error);
    return res.status(500).json({
      mensaje: 'Error al obtener la reseña.',
      error: error.message
    });
  }
};

export const registrarResena = async (req, res) => {
  const datos = req.body || {};
  const usuarioId = normalizarTexto(datos.usuarioId);
  const productoId = normalizarTexto(datos.productoId);
  const comentario = normalizarTexto(datos.comentario);
  const calificacion = Number(datos.calificacion);

  if (!usuarioId || !productoId) {
    return res.status(400).json({
      mensaje: 'usuarioId y productoId son obligatorios.'
    });
  }

  if (!validarCalificacion(datos.calificacion)) {
    return res.status(400).json({
      mensaje: 'La calificacion debe ser un número entero entre 1 y 5.'
    });
  }

  if (!comentario) {
    return res.status(400).json({ mensaje: 'El comentario es obligatorio.' });
  }

  try {
    const usuarioRef = db.collection(USUARIOS).doc(usuarioId);
    const productoRef = db.collection(PRODUCTOS).doc(productoId);
    const [usuarioDoc, productoDoc] = await Promise.all([
      usuarioRef.get(),
      productoRef.get()
    ]);

    if (!usuarioDoc.exists) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    if (!productoDoc.exists) {
      return res.status(404).json({ mensaje: 'Producto no encontrado.' });
    }

    if (!await validarCompra(usuarioId, productoId)) {
      return res.status(403).json({
        mensaje: 'Solo puedes reseñar productos que hayas comprado.'
      });
    }

    const resenaRef = db.collection(RESENAS).doc(`${productoId}_${usuarioId}`);
    const resenaExistente = await resenaRef.get();
    if (resenaExistente.exists) {
      return res.status(409).json({
        mensaje: 'Ya existe una reseña de este usuario para ese producto. Puedes actualizarla.'
      });
    }

    const nuevaResena = {
      calificacion,
      comentario,
      correoUsuario: normalizarTexto(usuarioDoc.data().correo),
      nombreProducto: normalizarTexto(productoDoc.data().nombre),
      productoId,
      usuarioId
    };

    await resenaRef.create(nuevaResena);

    return res.status(201).json({
      mensaje: 'Reseña registrada correctamente.',
      resena: { id: resenaRef.id, ...nuevaResena }
    });
  } catch (error) {
    console.error('Error al registrar la reseña:', error);
    return res.status(500).json({
      mensaje: 'Error al registrar la reseña.',
      error: error.message
    });
  }
};

export const actualizarResena = async (req, res) => {
  const { id } = req.params;
  const datos = req.body || {};
  const actualizacion = {};

  if (datos.comentario !== undefined) {
    const comentario = normalizarTexto(datos.comentario);
    if (!comentario) {
      return res.status(400).json({ mensaje: 'El comentario no puede estar vacío.' });
    }
    actualizacion.comentario = comentario;
  }

  if (datos.calificacion !== undefined) {
    if (!validarCalificacion(datos.calificacion)) {
      return res.status(400).json({
        mensaje: 'La calificacion debe ser un número entero entre 1 y 5.'
      });
    }
    actualizacion.calificacion = Number(datos.calificacion);
  }

  if (Object.keys(actualizacion).length === 0) {
    return res.status(400).json({
      mensaje: 'Envía al menos comentario o calificacion para actualizar.'
    });
  }

  if (datos.productoId !== undefined || datos.usuarioId !== undefined) {
    return res.status(400).json({
      mensaje: 'productoId y usuarioId no se pueden modificar.'
    });
  }

  try {
    const resenaRef = db.collection(RESENAS).doc(id);
    const resenaDoc = await resenaRef.get();
    if (!resenaDoc.exists) {
      return res.status(404).json({ mensaje: 'Reseña no encontrada.' });
    }

    await resenaRef.update(actualizacion);
    return res.status(200).json({
      mensaje: 'Reseña actualizada correctamente.',
      resena: {
        ...resenaDoc.data(),
        ...actualizacion,
        id
      }
    });
  } catch (error) {
    console.error('Error al actualizar la reseña:', error);
    return res.status(500).json({
      mensaje: 'Error al actualizar la reseña.',
      error: error.message
    });
  }
};

export const eliminarResena = async (req, res) => {
  const { id } = req.params;

  try {
    const resenaRef = db.collection(RESENAS).doc(id);
    const resenaDoc = await resenaRef.get();
    if (!resenaDoc.exists) {
      return res.status(404).json({ mensaje: 'Reseña no encontrada.' });
    }

    await resenaRef.delete();
    return res.status(200).json({
      mensaje: 'Reseña eliminada correctamente.',
      id
    });
  } catch (error) {
    console.error('Error al eliminar la reseña:', error);
    return res.status(500).json({
      mensaje: 'Error al eliminar la reseña.',
      error: error.message
    });
  }
};

export const buscarResenas = async (req, res) => {
  const { q } = req.query;
  if (typeof q !== 'string' || q.trim() === '') {
    return res.status(400).json({
      mensaje: 'Debes enviar un término de búsqueda (parámetro q).'
    });
  }

  try {
    const termino = q.trim().toLocaleLowerCase();
    const snapshot = await db.collection(RESENAS).get();
    const resenas = snapshot.docs
      .map(serializarResena)
      .filter((resena) =>
        ['comentario', 'correoUsuario', 'nombreProducto', 'productoId', 'usuarioId']
          .some((campo) =>
            String(resena[campo] ?? '').toLocaleLowerCase().includes(termino)
          )
      );

    return res.status(200).json(resenas);
  } catch (error) {
    console.error('Error al buscar reseñas:', error);
    return res.status(500).json({
      mensaje: 'Error al buscar las reseñas.',
      error: error.message
    });
  }
};

export const exportarResenasCSV = async (req, res) => {
  try {
    const snapshot = await db.collection("resenas").get();

    const resenas = snapshot.docs.map((doc) => ({
      idDoc: doc.id,
      ...doc.data(),
    }));

    // Función para escapar correctamente valores CSV
    const escapar = (valor) => {
      if (valor === null || valor === undefined) return "";
      const str = String(valor);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Encabezados del CSV
    const encabezados = [
      "ID Documento",
      "Calificación",
      "Comentario",
      "Correo Usuario",
      "Usuario ID",
      "Nombre Producto",
      "Producto ID",
    ];

    const lineas = [encabezados.join(",")];

    // Filas de datos
    resenas.forEach((resena) => {
      const fila = [
        escapar(resena.idDoc),
        resena.calificacion ?? "",
        escapar(resena.comentario),
        escapar(resena.correoUsuario),
        escapar(resena.usuarioId),
        escapar(resena.nombreProducto),
        escapar(resena.productoId),
      ];

      lineas.push(fila.join(","));
    });

    const csvContent = lineas.join("\n");

    const nombreArchivo = `resenas-${new Date().toISOString().slice(0, 10)}.csv`;

    // Headers para forzar la descarga
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nombreArchivo}"`
    );

    // BOM UTF-8 para que Excel muestre bien los acentos
    res.write("\uFEFF");
    res.end(csvContent);
  } catch (error) {
    console.error("Error al exportar reseñas a CSV:", error);
    res.status(500).json({
      mensaje: "Error al generar el archivo CSV de reseñas.",
      error: error.message,
    });
  }
};
