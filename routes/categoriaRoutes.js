import express from "express";

import { crearCategoria } from "../controllers/categoria.controller.js";

const router = express.Router();

router.post("/categorias", crearCategoria);

export default router;