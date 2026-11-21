import express from "express";

import authMiddleWare from "../middleWare/authMiddleWare.js";
import adminMiddleWare from "../middleWare/adminMiddleWare.js";

import {
  getAllOrganisationsForAdmin,
  getOrganisationByIdForAdmin,
} from "../controllers/adminOrganisationController.js";

const router = express.Router();

// Get all organisations
router.get("/", authMiddleWare, adminMiddleWare, getAllOrganisationsForAdmin);

// Get individual organisation
router.get(
  "/:id",
  authMiddleWare,
  adminMiddleWare,
  getOrganisationByIdForAdmin,
);

export default router;
