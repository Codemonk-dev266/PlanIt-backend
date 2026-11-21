import express from "express";
import {
  getAllProgrammesForAdmin,
  getProgrammeByIdForAdmin,
} from "../controllers/adminProgrammeController.js";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import adminMiddleWare from "../middleWare/adminMiddleWare.js";

const router = express.Router();

// get all programmes for admin
router.get("/", authMiddleWare, adminMiddleWare, getAllProgrammesForAdmin);

// get individual programme
router.get("/:id", getProgrammeByIdForAdmin);

export default router;
