import db from '../firebase.js';
import supabase from '../supabase.js';
import { randomUUID } from 'node:crypto';

export const obtenerProductos = async (req, res) => {
  try {
    const snapshot = await db.collection('productos').get();
    const productos = snapshot.docs.map((doc) => {
      const data = doc.data();
      const categoria = data.categoria ?? data.categoria_id ?? null;

      return {
        id: doc.id,
        ...data,
        categoria
      };
    });

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
      categoria: {
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


export const actualizarProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, stock } = req.body || {};
    const imageFile = req.files?.image?.[0] || req.files?.imagen?.[0];
    let categoria;

    try {
      categoria = typeof req.body?.categoria === 'string'
        ? JSON.parse(req.body.categoria)
        : req.body?.categoria;
    } catch {
      return res.status(400).json({
        mensaje: 'La categoria debe ser un objeto JSON valido'
      });
    }

    if (!nombre || precio === undefined || stock === undefined || !categoria?.nombre || !categoria?.descripcion) {
      return res.status(400).json({
        mensaje: 'El nombre, precio, stock y categoria (nombre y descripcion) son obligatorios.'
      });
    }

    const docRef = db.collection('productos').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        mensaje: 'Producto no encontrado.'
      });
    }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'productos';
    let imageUrl = doc.data()?.image || '';

    if (imageFile) {
      if (!imageFile.mimetype?.startsWith('image/')) {
        return res.status(400).json({
          mensaje: 'El archivo debe ser una imagen.'
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
        console.error('Error al subir imagen del producto:', uploadError);
        return res.status(500).json({
          mensaje: 'Error al subir la imagen del producto.',
          error: uploadError.message
        });
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(imagePath);

      imageUrl = publicUrlData.publicUrl;
    }

    const precioNumerico = Number(precio);
    const stockNumerico = Number(stock);

    if (!Number.isFinite(precioNumerico) || precioNumerico < 0 || !Number.isInteger(stockNumerico) || stockNumerico < 0) {
      return res.status(400).json({
        mensaje: 'El precio debe ser un numero mayor o igual a 0 y el stock un entero mayor o igual a 0.'
      });
    }

    const productoActualizado = {
      nombre: nombre.trim(),
      precio: precioNumerico,
      stock: stockNumerico,
      image: imageUrl,
      categoria: {
        nombre: categoria.nombre.trim(),
        descripcion: categoria.descripcion.trim()
      }
    };

    await docRef.update(productoActualizado);

    return res.status(200).json({
      mensaje: 'Producto actualizado correctamente.',
      id,
      producto: {
        id,
        ...productoActualizado
      }
    });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    return res.status(500).json({
      mensaje: 'Error al actualizar el producto.',
      error: error.message
    });
  }
};


export const eliminarProducto = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        mensaje: 'El ID del producto es obligatorio.'
      });
    }

    const docRef = db.collection('productos').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        mensaje: 'Producto no encontrado.'
      });
    }

    const data = doc.data();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'productos';
    const imageUrl = data?.image;

    if (imageUrl) {
      try {
        const url = new URL(imageUrl);
        const pathname = decodeURIComponent(url.pathname);
        const bucketPrefix = `/storage/v1/object/public/${bucket}/`;
        const relativePathIndex = pathname.indexOf(bucketPrefix);

        if (relativePathIndex !== -1) {
          const filePath = pathname.substring(relativePathIndex + bucketPrefix.length);
          if (filePath) {
            const { error: removeError } = await supabase.storage
              .from(bucket)
              .remove([filePath]);

            if (removeError) {
              console.error('No se pudo eliminar la imagen de Supabase:', removeError.message);
            }
          }
        }
      } catch (err) {
        console.error('No se pudo procesar la imagen del producto para eliminarla:', err.message);
      }
    }

    await docRef.delete();

    return res.status(200).json({
      mensaje: 'Producto eliminado con éxito.',
      id
    });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    return res.status(500).json({
      mensaje: 'Error al eliminar el producto.',
      error: error.message
    });
  }
};