import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import db from '../firebase.js';
import { calcularEstadisticas } from './estadisticas.controller.js';

const fechaArchivo = () => new Date().toISOString().slice(0, 10);

const configurarDescarga = (res, tipo, nombre) => {
  res.setHeader('Content-Type', tipo);
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
};

const agregarFilasResumen = (hoja, estadisticas) => {
  const filas = [
    ['Productos', estadisticas.productos.total],
    ['Precio promedio', estadisticas.productos.promedioPrecio],
    ['Stock total', estadisticas.productos.stockTotal],
    ['Productos sin stock', estadisticas.productos.sinStock],
    ['Usuarios', estadisticas.usuarios.total],
    ['Pedidos', estadisticas.pedidos.total],
    ['Reseñas', estadisticas.resenas.total],
    ['Categorías', estadisticas.categorias.total],
    ['Fecha de generación', new Date()]
  ];

  hoja.addRow(['Métrica', 'Valor']);
  filas.forEach((fila) => hoja.addRow(fila));

  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  encabezado.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  hoja.getColumn(1).width = 28;
  hoja.getColumn(2).width = 24;
  hoja.getCell('B5').numFmt = '"$"#,##0.00';
  hoja.getCell('B12').numFmt = 'dd/mm/yyyy hh:mm';
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
};

export const exportarEstadisticasExcel = async (req, res) => {
  try {
    const [
      estadisticas,
      productosSnapshot,
      categoriasSnapshot,
      usuariosSnapshot
    ] = await Promise.all([
      calcularEstadisticas(),
      db.collection('productos').get(),
      db.collection('categorias').get(),
      db.collection('usuario').get()
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema de tienda';
    workbook.created = new Date();

    const resumen = workbook.addWorksheet('Resumen');
    resumen.mergeCells('A1:B1');
    resumen.getCell('A1').value = 'ESTADÍSTICAS DE LA TIENDA';
    resumen.getCell('A1').font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFFFFFF' }
    };
    resumen.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' }
    };
    resumen.getCell('A1').alignment = { horizontal: 'center' };
    resumen.getRow(1).height = 28;
    resumen.addRow([]);
    agregarFilasResumen(resumen, estadisticas);

    const productos = workbook.addWorksheet('Productos');
    productos.columns = [
      { header: 'ID', key: 'id', width: 30 },
      { header: 'Nombre', key: 'nombre', width: 32 },
      { header: 'Precio', key: 'precio', width: 16 },
      { header: 'Stock', key: 'stock', width: 12 },
      { header: 'Categoría ID', key: 'categoria_id', width: 30 }
    ];
    productosSnapshot.docs.forEach((doc) => {
      const datos = doc.data();
      productos.addRow({
        id: doc.id,
        nombre: datos.nombre || '',
        precio: Number(datos.precio) || 0,
        stock: Number(datos.stock) || 0,
        categoria_id: datos.categoria_id || ''
      });
    });
    productos.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    productos.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5B9BD5' }
    };
    productos.getColumn('precio').numFmt = '"$"#,##0.00';
    productos.views = [{ state: 'frozen', ySplit: 1 }];
    productos.autoFilter = 'A1:E1';

    const porCategoria = workbook.addWorksheet('Productos por categoría');
    porCategoria.columns = [
      { header: 'Categoría', key: 'categoria', width: 32 },
      { header: 'Producto', key: 'producto', width: 36 },
      { header: 'Cantidad de productos', key: 'cantidad', width: 24 }
    ];

    const gruposPorCategoria = new Map();
    const categoriaPorId = new Map();
    categoriasSnapshot.docs.forEach((doc) => {
      const datos = doc.data();
      const grupo = {
        nombre: datos.nombre_categoria || 'Categoría sin nombre',
        productos: []
      };
      gruposPorCategoria.set(doc.id, grupo);
      categoriaPorId.set(String(doc.id).trim(), doc.id);
      if (datos.id !== undefined && datos.id !== null) {
        categoriaPorId.set(String(datos.id), doc.id);
      }
    });

    productosSnapshot.docs.forEach((doc) => {
      const datos = doc.data();
      const categoriaId = typeof datos.categoria_id === 'string' ||
        typeof datos.categoria_id === 'number'
        ? String(datos.categoria_id).trim()
        : '';
      const categoriaKey = categoriaId
        ? categoriaPorId.get(categoriaId) || categoriaId
        : 'Sin categoría';

      if (!gruposPorCategoria.has(categoriaKey)) {
        gruposPorCategoria.set(categoriaKey, {
          nombre: categoriaId
            ? `Categoría no encontrada (${categoriaId})`
            : 'Sin categoría',
          productos: []
        });
      }
      gruposPorCategoria.get(categoriaKey).productos.push(datos.nombre || '');
    });

    [...gruposPorCategoria.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .forEach((grupo) => {
        const productosDeCategoria = grupo.productos.length
          ? grupo.productos
          : [''];
        productosDeCategoria.forEach((producto) => {
          porCategoria.addRow({
            categoria: grupo.nombre,
            producto,
            cantidad: grupo.productos.length
          });
        });
      });
    porCategoria.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    porCategoria.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' }
    };
    porCategoria.views = [{ state: 'frozen', ySplit: 1 }];
    porCategoria.autoFilter = 'A1:C1';

    const porRol = workbook.addWorksheet('Usuarios por rol');
    porRol.columns = [
      { header: 'Rol', key: 'rol', width: 24 },
      { header: 'Nombre del usuario', key: 'usuario', width: 36 },
      { header: 'Cantidad de usuarios', key: 'cantidad', width: 24 }
    ];
    const usuariosPorRol = new Map();
    usuariosSnapshot.docs.forEach((doc) => {
      const datos = doc.data();
      const rol = typeof datos.rol === 'string' && datos.rol.trim()
        ? datos.rol.trim()
        : 'Sin rol';
      const nombre = [datos.nombres, datos.apellidos]
        .filter((parte) => typeof parte === 'string' && parte.trim())
        .join(' ')
        .trim() || 'Sin nombre registrado';

      if (!usuariosPorRol.has(rol)) {
        usuariosPorRol.set(rol, []);
      }
      usuariosPorRol.get(rol).push(nombre);
    });
    [...usuariosPorRol.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([rol, nombres]) => {
        nombres.forEach((usuario) => {
          porRol.addRow({
            rol,
            usuario,
            cantidad: nombres.length
          });
        });
      });
    porRol.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    porRol.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' }
    };
    porRol.views = [{ state: 'frozen', ySplit: 1 }];
    porRol.autoFilter = 'A1:C1';

    configurarDescarga(
      res,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `estadisticas-tienda-${fechaArchivo()}.xlsx`
    );
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('Error al generar Excel:', error);
    if (res.headersSent) {
      return res.destroy(error);
    }

    return res.status(500).json({
      mensaje: 'Error al generar el archivo Excel.',
      error: error.message
    });
  }
};

const agregarSeccionPdf = (doc, titulo) => {
  if (doc.y > doc.page.height - 100) {
    doc.addPage();
  }

  doc.moveDown(0.7)
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#1F4E78')
    .text(titulo);
  doc.moveDown(0.3)
    .strokeColor('#5B9BD5')
    .lineWidth(1)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5).fillColor('#333333');
};

const agregarFilaPdf = (doc, etiqueta, valor) => {
  if (doc.y > doc.page.height - 75) {
    doc.addPage();
  }

  doc.font('Helvetica-Bold').fontSize(10).text(`${etiqueta}: `, {
    continued: true
  });
  doc.font('Helvetica').text(String(valor));
  doc.moveDown(0.25);
};

export const exportarEstadisticasPDF = async (req, res) => {
  try {
    const estadisticas = await calcularEstadisticas();
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 55, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: 'Estadísticas de la tienda',
        Author: 'Sistema de tienda'
      }
    });

    configurarDescarga(res, 'application/pdf', `estadisticas-tienda-${fechaArchivo()}.pdf`);
    doc.pipe(res);

    doc.font('Helvetica-Bold')
      .fontSize(22)
      .fillColor('#1F4E78')
      .text('Estadísticas de la tienda', { align: 'center' });
    doc.moveDown(0.4)
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666666')
      .text(`Generado el: ${new Date().toLocaleString('es')}`, { align: 'center' });

    agregarSeccionPdf(doc, 'Resumen general');
    agregarFilaPdf(doc, 'Total de productos', estadisticas.productos.total);
    agregarFilaPdf(doc, 'Precio promedio', `$${estadisticas.productos.promedioPrecio.toFixed(2)}`);
    agregarFilaPdf(doc, 'Unidades en stock', estadisticas.productos.stockTotal);
    agregarFilaPdf(doc, 'Productos sin stock', estadisticas.productos.sinStock);
    agregarFilaPdf(doc, 'Total de usuarios', estadisticas.usuarios.total);
    agregarFilaPdf(doc, 'Total de pedidos', estadisticas.pedidos.total);
    agregarFilaPdf(doc, 'Total de reseñas', estadisticas.resenas.total);
    agregarFilaPdf(doc, 'Total de categorías', estadisticas.categorias.total);

    agregarSeccionPdf(doc, 'Productos por categoría');
    const categorias = Object.entries(estadisticas.productos.porCategoria)
      .sort((a, b) => b[1] - a[1]);
    if (categorias.length === 0) {
      agregarFilaPdf(doc, 'Información', 'No hay productos registrados.');
    } else {
      categorias.forEach(([categoria, cantidad]) => {
        agregarFilaPdf(doc, categoria, cantidad);
      });
    }

    agregarSeccionPdf(doc, 'Usuarios por rol');
    const roles = Object.entries(estadisticas.usuarios.porRol)
      .sort((a, b) => b[1] - a[1]);
    if (roles.length === 0) {
      agregarFilaPdf(doc, 'Información', 'No hay usuarios registrados.');
    } else {
      roles.forEach(([rol, cantidad]) => agregarFilaPdf(doc, rol, cantidad));
    }

    const paginas = doc.bufferedPageRange();
    for (let pagina = 0; pagina < paginas.count; pagina += 1) {
      doc.switchToPage(pagina);
      doc.font('Helvetica')
        .fontSize(8)
        .fillColor('#888888')
        .text(
          `Página ${pagina + 1} de ${paginas.count} | Estadísticas de la tienda`,
          50,
          doc.page.height - 35,
          { width: doc.page.width - 100, align: 'center' }
        );
    }

    return doc.end();
  } catch (error) {
    console.error('Error al generar PDF:', error);
    if (res.headersSent) {
      return res.destroy(error);
    }

    return res.status(500).json({
      mensaje: 'Error al generar el archivo PDF.',
      error: error.message
    });
  }
};
