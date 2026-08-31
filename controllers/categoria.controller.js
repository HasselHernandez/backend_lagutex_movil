import supabase from "../supabase.js";

export const crearCategoria = async (req, res) => {
  try {
    const { nombre_categoria, descripcion_categoria } = req.body;

    // Validar que venga el nombre
    if (!nombre_categoria) {
      return res.status(400).json({
        mensaje: "El nombre de la categoría es obligatorio"
      });
    }

    const { data, error } = await supabase
      .from("categorias")
      .insert([
        {
          nombre_categoria,
          descripcion_categoria
        }
      ])
      .select();

    if (error) {
      console.error(error);

      return res.status(500).json({
        mensaje: "Error al crear la categoría",
        error: error.message
      });
    }

    res.status(201).json({
      mensaje: "Categoría creada correctamente",
      categoria: data[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      mensaje: "Error interno del servidor",
      error: error.message
    });
  }
};