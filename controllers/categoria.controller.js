import db from "../firebase.js";

export const exportarCategoriasCSV = async (req, res) => {
  try {
    const snapshot = await db.collection("categorias").get();

    const categorias = snapshot.docs.map((doc) => ({
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
    const encabezados = ["ID Documento", "ID", "Nombre de Categoría", "Descripción"];

    const lineas = [encabezados.join(",")];

    // Filas de datos
    categorias.forEach((categoria) => {
      const fila = [
        escapar(categoria.idDoc),
        categoria.id ?? "",
        escapar(categoria.nombre_categoria),
        escapar(categoria.descripcion_categoria),
      ];

      lineas.push(fila.join(","));
    });

    const csvContent = lineas.join("\n");

    const nombreArchivo = `categorias-${new Date().toISOString().slice(0, 10)}.csv`;

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
    console.error("Error al exportar categorías a CSV:", error);
    res.status(500).json({
      mensaje: "Error al generar el archivo CSV de categorías.",
      error: error.message,
    });
  }
};