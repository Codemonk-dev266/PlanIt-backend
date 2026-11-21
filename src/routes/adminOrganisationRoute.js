import express from "express";

import authMiddleWare from "../middleware/authMiddleWare.js";
import adminMiddleWare from "../middleware/adminMiddleWare.js";

import {
  getAllOrganisationsForAdmin,
  getOrganisationByIdForAdmin,
} from "../controllers/adminOrganisationController.js";

const router = express.Router();

// Protect every route
router.use(authMiddleWare, adminMiddleWare);

// Get all organisations
router.get("/", getAllOrganisationsForAdmin);

// Get individual organisation
router.get("/:id", getOrganisationByIdForAdmin);

export default router;
