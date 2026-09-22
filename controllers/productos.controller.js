import db from '../firebase.js';
import supabase from '../supabase.js';
import { randomUUID } from 'node:crypto';

export const obtenerProductos = async (req, res) => {
  try {
    const snapshot = await db.collection('productos').get();
    const productos = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(productos);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    return res.status(500).json({
      mensaje: 'Error al obtener los productos',
      error: error.message
    });
  }
};

  export const registrarProducto = async (req, res) => {
  const { nombre, precio, stock } = req.body;
  let categoria;

    try {
    categoria = typeof req.body.categoria === 'string'
      ? JSON.parse(req.body.categoria)
      : req.body.categoria;
  } catch {
    return res.status(400).json({
      mensaje: 'La categoria debe ser un objeto JSON valido'
    });
  }

    const imageFile = req.files?.image?.[0] || req.files?.imagen?.[0];
    

  if (
    !nombre ||
    precio === undefined ||
    stock === undefined ||
    !categoria?.nombre ||
    !categoria?.descripcion ||
    !imageFile
  ) {
    return res.status(400).json({
      mensaje: 'El nombre, precio, image, stock y categoria (nombre y descripcion) son obligatorios'
    });
  }

   const precioNumerico = Number(precio);
  const stockNumerico = Number(stock);

   if (!Number.isFinite(precioNumerico) || precioNumerico < 0 || !Number.isInteger(stockNumerico) || stockNumerico < 0) {
    return res.status(400).json({
      mensaje: 'El precio debe ser un numero mayor o igual a 0 y el stock un entero mayor o igual a 0'
    });
  }


  try {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      return res.status(500).json({
        mensaje: 'Faltan las variables de configuración de Firebase'
      });
    }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'productos';
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        mensaje: 'Faltan las variables de configuración de Supabase'
      });
    }

      const extension = imageFile.originalname.includes('.')
      ? imageFile.originalname.substring(imageFile.originalname.lastIndexOf('.')).toLowerCase()
      : '';
    const imagePath = `${randomUUID()}${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(imagePath, imageFile.buffer, {
        contentType: imageFile.mimetype,
        upsert: false
      });

        if (uploadError) {
      console.error('Error al subir imagen a Supabase:', uploadError);
      return res.status(500).json({
        mensaje: `Error al guardar la imagen del producto: ${uploadError.message}`
      });
    }
    
      const { data: imageData } = supabase.storage.from(bucket).getPublicUrl(imagePath);
    const productoRef = db.collection('productos').doc();
    const nuevoProducto = {
      nombre: nombre.trim(),
      precio: precioNumerico,
      image: imageData.publicUrl,
      stock: stockNumerico,
      categoria_id: {
        nombre: categoria.nombre.trim(),
        descripcion: categoria.descripcion.trim()
      }
    };

       await productoRef.set(nuevoProducto);

    return res.status(201).json({
      mensaje: 'Producto registrado correctamente',
      producto: {
        id: productoRef.id,
        ...nuevoProducto
      }

    });
    
  } catch (error) {
    console.error('Error al registrar producto:', error);
    return res.status(500).json({
      mensaje: `Error al registrar el producto: ${error.message}`
    });
  }
};
