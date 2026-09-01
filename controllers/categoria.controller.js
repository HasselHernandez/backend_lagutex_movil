import db from "../firebase.js";

export const crearCategoria = async (req, res) => {
  try {
    const { nombre_categoria, descripcion_categoria } = req.body;

    // Validar que venga el nombre
    if (!nombre_categoria) {
      return res.status(400).json({
        mensaje: "El nombre de la categoría es obligatorio"
      });
    }

    // Datos de la categoría
    const categoria = {
      nombre_categoria,
      descripcion_categoria: descripcion_categoria || ""
    };

    // Crear documento dentro de la colección categorias
    const documento = await db
      .collection("categorias")
      .add(categoria);

    res.status(201).json({
      mensaje: "Categoría creada correctamente",
      id: documento.id,
      categoria: categoria
    });

  } catch (error) {
    console.error("Error al crear categoría:", error);

    res.status(500).json({
      mensaje: "Error al crear la categoría",
      error: error.message
    });
  }
};