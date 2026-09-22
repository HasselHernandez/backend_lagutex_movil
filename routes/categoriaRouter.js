import express from "express";

import { crearCategoria } from "../controllers/categoria.controller.js";

const categoriaRouter = express.Router();

categoriaRouter.post("/categorias", crearCategoria);

export default categoriaRouter;