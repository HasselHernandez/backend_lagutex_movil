import db from '../firebase.js';

const PEDIDOS = 'pedidos';
const USUARIOS = 'usuario';
const PRODUCTOS = 'productos';
const CAMPOS_DIRECCION = ['municipio', 'barrio', 'departamento', 'direccion'];

const normalizarTexto = (valor) => (
  typeof valor === 'string' ? valor.trim() : ''
);

const leerCampoDireccion = (direccion, campo) => {
  if (!direccion || typeof direccion !== 'object' || Array.isArray(direccion)) {
    return '';
  }

  const clave = Object.keys(direccion).find(
    (nombre) => nombre.toLocaleLowerCase() === campo.toLocaleLowerCase()
  );
  return clave === undefined ? '' : normalizarTexto(direccion[clave]);
};

const serializarPedido = (doc) => ({
  ...doc.data(),
  id: doc.id
});

const validarImporte = (valor) => (
  Number.isFinite(Number(valor)) && Number(valor) >= 0
);

const normalizarLineas = (productos) => {
  if (!Array.isArray(productos) || productos.length === 0) {
    return { error: 'Debes agregar al menos un producto al pedido.' };
  }

  const cantidades = new Map();
  for (const producto of productos) {
    const productoId = normalizarTexto(producto?.producto_id ?? producto?.id);
    const cantidad = Number(producto?.cantidad);

    if (!productoId || !Number.isInteger(cantidad) || cantidad < 1) {
      return {
        error: 'Cada producto debe incluir un producto_id válido y una cantidad entera mayor que cero.'
      };
    }

    cantidades.set(productoId, (cantidades.get(productoId) || 0) + cantidad);
  }

  return {
    lineas: [...cantidades].map(([productoId, cantidad]) => ({
      productoId,
      cantidad
    }))
  };
};

const obtenerDetalleProductos = async (transaction, lineas) => {
  const referencias = lineas.map(({ productoId }) =>
    db.collection(PRODUCTOS).doc(productoId)
  );
  const documentos = await Promise.all(
    referencias.map((referencia) => transaction.get(referencia))
  );
  const productos = [];

  for (let indice = 0; indice < documentos.length; indice += 1) {
    const documento = documentos[indice];
    if (!documento.exists) {
      return { error: `No se encontró el producto ${lineas[indice].productoId}.` };
    }

    const datos = documento.data();
    const precio = Number(datos.precio);
    if (!Number.isFinite(precio) || precio < 0) {
      return { error: `El producto ${lineas[indice].productoId} tiene un precio inválido.` };
    }

    const producto = {
      producto_id: documento.id,
      nombre: normalizarTexto(datos.nombre),
      precio,
      image: normalizarTexto(datos.image),
      cantidad: lineas[indice].cantidad
    };

    if (datos.categoria_id !== undefined) {
      producto.categoria_id = datos.categoria_id;
    }

    productos.push(producto);
  }

  return {
    productos,
    subtotal: productos.reduce(
      (total, producto) => total + producto.precio * producto.cantidad,
      0
    )
  };
};

const obtenerDireccion = (usuario, datos) => {
  const direccionesGuardadas = usuario.direcciones;
  const direcciones = Array.isArray(direccionesGuardadas)
    ? direccionesGuardadas
    : direccionesGuardadas &&
        typeof direccionesGuardadas === 'object'
      ? Object.values(direccionesGuardadas)
      : [];
  let indice = datos.direccionIndex === undefined ? 0 : datos.direccionIndex;

  if (datos.direccion !== undefined) {
    if (!datos.direccion || typeof datos.direccion !== 'object' || Array.isArray(datos.direccion)) {
      return { error: 'La dirección seleccionada no es válida.' };
    }

    indice = direcciones.findIndex((direccion) =>
      CAMPOS_DIRECCION.every((campo) =>
        leerCampoDireccion(direccion, campo) === leerCampoDireccion(datos.direccion, campo)
      )
    );
  }

  if (!Number.isInteger(indice) || indice < 0 || indice >= direcciones.length) {
    return { error: 'El usuario no tiene una dirección válida seleccionada.' };
  }

  const direccion = direcciones[indice];
  if (!CAMPOS_DIRECCION.every((campo) => leerCampoDireccion(direccion, campo))) {
    return { error: 'La dirección del usuario está incompleta.' };
  }

  return {
    direccion: Object.fromEntries(
      CAMPOS_DIRECCION.map((campo) => [campo, leerCampoDireccion(direccion, campo)])
    )
  };
};

export const obtenerPedidos = async (req, res) => {
  try {
    const snapshot = await db.collection(PEDIDOS).get();
    return res.status(200).json(snapshot.docs.map(serializarPedido));
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    return res.status(500).json({
      mensaje: 'Error al obtener los pedidos.',
      error: error.message
    });
  }
};

export const obtenerPedido = async (req, res) => {
  try {
    const documento = await db.collection(PEDIDOS).doc(req.params.id).get();
    if (!documento.exists) {
      return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
    }

    return res.status(200).json(serializarPedido(documento));
  } catch (error) {
    console.error('Error al obtener el pedido:', error);
    return res.status(500).json({
      mensaje: 'Error al obtener el pedido.',
      error: error.message
    });
  }
};

export const registrarPedido = async (req, res) => {
  const datos = req.body || {};
  const usuarioId = normalizarTexto(datos.usuarioId);
  const resultadoLineas = normalizarLineas(datos.productos);
  const costoEnvio = datos.costoEnvio === undefined ? 0 : Number(datos.costoEnvio);

  if (!usuarioId) {
    return res.status(400).json({ mensaje: 'El usuarioId es obligatorio.' });
  }

  if (resultadoLineas.error) {
    return res.status(400).json({ mensaje: resultadoLineas.error });
  }

  if (!validarImporte(costoEnvio)) {
    return res.status(400).json({
      mensaje: 'El costoEnvio debe ser un número mayor o igual a cero.'
    });
  }

  try {
    const pedidoRef = db.collection(PEDIDOS).doc();
    const resultado = await db.runTransaction(async (transaction) => {
      const usuarioRef = db.collection(USUARIOS).doc(usuarioId);
      const usuarioDoc = await transaction.get(usuarioRef);

      if (!usuarioDoc.exists) {
        return { error: 'Usuario no encontrado.', status: 404 };
      }

      const resultadoDireccion = obtenerDireccion(usuarioDoc.data(), datos);
      if (resultadoDireccion.error) {
        return { error: resultadoDireccion.error, status: 400 };
      }

      const detalle = await obtenerDetalleProductos(transaction, resultadoLineas.lineas);
      if (detalle.error) {
        return { error: detalle.error, status: 400 };
      }

      const pedido = {
        estado: 'Pendiente',
        fecha: new Date(),
        subtotal: detalle.subtotal,
        costoEnvio,
        total: detalle.subtotal + costoEnvio,
        usuarioId,
        correoUsuario: normalizarTexto(usuarioDoc.data().correo),
        direccion: resultadoDireccion.direccion,
        productos: detalle.productos,
        mensajeCliente: normalizarTexto(datos.mensajeCliente)
      };

      transaction.create(pedidoRef, pedido);
      return { pedido };
    });

    if (resultado.error) {
      return res.status(resultado.status).json({ mensaje: resultado.error });
    }

    return res.status(201).json({
      mensaje: 'Pedido registrado correctamente.',
      pedido: { id: pedidoRef.id, ...resultado.pedido }
    });
  } catch (error) {
    console.error('Error al registrar el pedido:', error);
    return res.status(500).json({
      mensaje: 'Error al registrar el pedido.',
      error: error.message
    });
  }
};

export const actualizarPedido = async (req, res) => {
  const { id } = req.params;
  const datos = req.body || {};
  const camposPermitidos = [
    'estado',
    'costoEnvio',
    'productos',
    'direccion',
    'direccionIndex',
    'mensajeCliente'
  ];

  if (datos.usuarioId !== undefined || datos.subtotal !== undefined || datos.total !== undefined) {
    return res.status(400).json({
      mensaje: 'usuarioId, subtotal y total no se pueden modificar directamente.'
    });
  }

  if (!camposPermitidos.some((campo) => datos[campo] !== undefined)) {
    return res.status(400).json({
      mensaje: 'No se enviaron campos válidos para actualizar.'
    });
  }

  if (datos.estado !== undefined && !normalizarTexto(datos.estado)) {
    return res.status(400).json({ mensaje: 'El estado no puede estar vacío.' });
  }

  if (datos.costoEnvio !== undefined && !validarImporte(datos.costoEnvio)) {
    return res.status(400).json({
      mensaje: 'El costoEnvio debe ser un número mayor o igual a cero.'
    });
  }

  const resultadoLineas = datos.productos === undefined
    ? null
    : normalizarLineas(datos.productos);
  if (resultadoLineas?.error) {
    return res.status(400).json({ mensaje: resultadoLineas.error });
  }

  try {
    const pedidoRef = db.collection(PEDIDOS).doc(id);
    const resultado = await db.runTransaction(async (transaction) => {
      const pedidoDoc = await transaction.get(pedidoRef);
      if (!pedidoDoc.exists) {
        return { error: 'Pedido no encontrado.', status: 404 };
      }

      const pedidoActual = pedidoDoc.data();
      const actualizacion = {};

      if (datos.estado !== undefined) {
        actualizacion.estado = normalizarTexto(datos.estado);
      }

      if (datos.mensajeCliente !== undefined) {
        if (typeof datos.mensajeCliente !== 'string') {
          return {
            error: 'El mensajeCliente debe ser texto.',
            status: 400
          };
        }
        actualizacion.mensajeCliente = datos.mensajeCliente.trim();
      }

      if (datos.direccion !== undefined || datos.direccionIndex !== undefined) {
        const usuarioRef = db.collection(USUARIOS).doc(pedidoActual.usuarioId);
        const usuarioDoc = await transaction.get(usuarioRef);
        if (!usuarioDoc.exists) {
          return { error: 'Usuario del pedido no encontrado.', status: 404 };
        }

        const resultadoDireccion = obtenerDireccion(usuarioDoc.data(), datos);
        if (resultadoDireccion.error) {
          return { error: resultadoDireccion.error, status: 400 };
        }
        actualizacion.direccion = resultadoDireccion.direccion;
      }

      if (resultadoLineas || datos.costoEnvio !== undefined) {
        let productos = pedidoActual.productos;
        let subtotal = Number(pedidoActual.subtotal);

        if (resultadoLineas) {
          const detalle = await obtenerDetalleProductos(transaction, resultadoLineas.lineas);
          if (detalle.error) {
            return { error: detalle.error, status: 400 };
          }
          productos = detalle.productos;
          subtotal = detalle.subtotal;
          actualizacion.productos = productos;
          actualizacion.subtotal = subtotal;
        }

        const costoEnvio = datos.costoEnvio === undefined
          ? Number(pedidoActual.costoEnvio)
          : Number(datos.costoEnvio);
        actualizacion.costoEnvio = costoEnvio;
        actualizacion.total = subtotal + costoEnvio;
      }

      transaction.update(pedidoRef, actualizacion);
      return { pedido: { ...pedidoActual, ...actualizacion, id } };
    });

    if (resultado.error) {
      return res.status(resultado.status).json({ mensaje: resultado.error });
    }

    return res.status(200).json({
      mensaje: 'Pedido actualizado correctamente.',
      pedido: resultado.pedido
    });
  } catch (error) {
    console.error('Error al actualizar el pedido:', error);
    return res.status(500).json({
      mensaje: 'Error al actualizar el pedido.',
      error: error.message
    });
  }
};

export const eliminarPedido = async (req, res) => {
  const { id } = req.params;
  try {
    const pedidoRef = db.collection(PEDIDOS).doc(id);
    const pedidoDoc = await pedidoRef.get();

    if (!pedidoDoc.exists) {
      return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
    }

    await pedidoRef.delete();
    return res.status(200).json({
      mensaje: 'Pedido eliminado correctamente.',
      id
    });
  } catch (error) {
    console.error('Error al eliminar el pedido:', error);
    return res.status(500).json({
      mensaje: 'Error al eliminar el pedido.',
      error: error.message
    });
  }
};

export const buscarPedidos = async (req, res) => {
  const { q } = req.query;
  if (typeof q !== 'string' || q.trim() === '') {
    return res.status(400).json({
      mensaje: 'Debes enviar un término de búsqueda (parámetro q).'
    });
  }

  try {
    const termino = q.trim().toLocaleLowerCase();
    const snapshot = await db.collection(PEDIDOS).get();
    const pedidos = snapshot.docs
      .map(serializarPedido)
      .filter((pedido) =>
        ['estado', 'usuarioId', 'correoUsuario', 'mensajeCliente']
          .some((campo) =>
            String(pedido[campo] ?? '').toLocaleLowerCase().includes(termino)
          )
      );

    return res.status(200).json(pedidos);
  } catch (error) {
    console.error('Error al buscar pedidos:', error);
    return res.status(500).json({
      mensaje: 'Error al buscar los pedidos.',
      error: error.message
    });
  }
};

  export const exportarPedidosCSV = async (req, res) => {
    try {
      const snapshot = await db.collection("pedidos").orderBy("fecha", "desc").get();

      const pedidos = snapshot.docs.map((doc) => ({
        idDoc: doc.id,
        ...doc.data(),
      }));

      // Función para escapar correctamente valores CSV
      const escapar = (valor) => {
        if (valor === null || valor === undefined) return "";
        const str = typeof valor === "object" ? JSON.stringify(valor) : String(valor);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Encabezados del CSV basados en la estructura de pedidos
      const encabezados = [
        "ID Documento",
        "Usuario ID",
        "Correo Usuario",
        "Estado",
        "Confirmación Cliente",
        "Subtotal",
        "Costo Envío",
        "Total",
        "Dirección",
        "Mensaje Admin",
        "Productos (Resumen)",
        "Fecha de Pedido",
      ];

      const lineas = [encabezados.join(",")];

      // Filas de datos
      pedidos.forEach((pedido) => {
        // Formatear la fecha de Firestore (puede ser Timestamp o string)
        let fechaFormateada = "";
        if (pedido.fecha) {
          const fechaObj = pedido.fecha.toDate ? pedido.fecha.toDate() : new Date(pedido.fecha);
          fechaFormateada = !isNaN(fechaObj) ? fechaObj.toLocaleString("es-ES") : String(pedido.fecha);
        }

        // Formatear dirección en un texto legible
        const dir = pedido.direccion || {};
        const direccionTexto = `Municipio: ${dir.municipio || ""}, Departamento: ${dir.department || dir.departamento || ""}, Barrio: ${dir.barrio || ""}, Detalle: ${dir.detalle || ""}`;

        // Formatear productos en un resumen legible
        const productosArray = pedido.productos 
          ? (Array.isArray(pedido.productos) ? pedido.productos : Object.values(pedido.productos))
          : [];
        
        const productosTexto = productosArray
          .map((p) => `${p.cantidad}x ${p.nombre} ($${p.precio})`)
          .join(" | ");

        const fila = [
          escapar(pedido.idDoc),
          escapar(pedido.usuarioId),
          escapar(pedido.correoUsuario),
          escapar(pedido.estado),
          escapar(pedido.confirmacionCliente),
          pedido.subtotal ?? "",
          pedido.costoEnvio ?? "",
          pedido.total ?? "",
          escapar(direccionTexto),
          escapar(pedido.mensajeAdmin),
          escapar(productosTexto),
          escapar(fechaFormateada),
        ];

        lineas.push(fila.join(","));
      });

      const csvContent = lineas.join("\n");

      const nombreArchivo = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;

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
      console.error("Error al exportar pedidos a CSV:", error);
      res.status(500).json({
        mensaje: "Error al generar el archivo CSV de pedidos.",
        error: error.message,
      });
    }
  };