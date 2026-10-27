import db from '../firebase.js';

const contarPorCampo = (documentos, campo, valorPorDefecto) => (
  documentos.reduce((conteo, doc) => {
    const valor = doc.data()[campo];
    const clave = typeof valor === 'string' && valor.trim()
      ? valor.trim()
      : valorPorDefecto;

    conteo[clave] = (conteo[clave] || 0) + 1;
    return conteo;
  }, {})
);

export const calcularEstadisticas = async () => {
  const [
    productosSnapshot,
    usuariosSnapshot,
    pedidosSnapshot,
    resenasSnapshot,
    categoriasSnapshot
  ] = await Promise.all([
    db.collection('productos').get(),
    db.collection('usuario').get(),
    db.collection('pedidos').get(),
    db.collection('reseñas').get(),
    db.collection('categorias').get()
  ]);

  const productos = productosSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
  const precios = productos
    .map((producto) => Number(producto.precio))
    .filter((precio) => Number.isFinite(precio) && precio >= 0);
  const stocks = productos
    .map((producto) => Number(producto.stock))
    .filter((stock) => Number.isFinite(stock) && stock >= 0);

  return {
    productos: {
      total: productos.length,
      promedioPrecio: precios.length
        ? Number((precios.reduce((suma, precio) => suma + precio, 0) / precios.length).toFixed(2))
        : 0,
      stockTotal: stocks.reduce((suma, stock) => suma + stock, 0),
      sinStock: productos.filter((producto) => Number(producto.stock) === 0).length,
      porCategoria: contarPorCampo(productos, 'categoria_id', 'Sin categoría')
    },
    usuarios: {
      total: usuariosSnapshot.size,
      porRol: contarPorCampo(usuariosSnapshot.docs, 'rol', 'Sin rol')
    },
    pedidos: {
      total: pedidosSnapshot.size
    },
    resenas: {
      total: resenasSnapshot.size
    },
    categorias: {
      total: categoriasSnapshot.size
    }
  };
};

export const obtenerEstadisticas = async (req, res) => {
  try {
    const estadisticas = await calcularEstadisticas();

    return res.status(200).json({
      mensaje: 'Estadísticas generadas correctamente.',
      ...estadisticas
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return res.status(500).json({
      mensaje: 'Error al generar las estadísticas.',
      error: error.message
    });
  }
};