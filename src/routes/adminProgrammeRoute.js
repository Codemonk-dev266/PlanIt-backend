import express from "express";
import {
  getAllProgrammesForAdmin,
  getProgrammeByIdForAdmin,
} from "../controllers/adminProgrammeController.js";

import authMiddleWare from "../middleware/authMiddleWare.js";
import adminMiddleWare from "../middleware/adminMiddleWare.js";

const router = express.Router();

// all routes require adminauthentication
router.use(authMiddleWare, adminMiddleWare);

// get all programmes for admin
router.get("/", getAllProgrammesForAdmin);

// get individual programme
router.get("/:id", getProgrammeByIdForAdmin);

export default router;
