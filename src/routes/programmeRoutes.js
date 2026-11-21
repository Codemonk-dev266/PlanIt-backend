import express from "express";
import {
  changeProgrammeStatus,
  createProgramme,
  deleteProgramme,
  getAllProgrammes,
  getMyProgrammes,
  getProgrammeBySlug,
  updateProgramme,
} from "../controllers/programmeController.js";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import roleMiddleWare from "../middleWare/roleMiddleWare.js";
import upload from "../middleWare/uploadMiddleWare.js";

const router = express.Router();

// 1. create programme
router.post(
  "/",
  authMiddleWare,
  // roleMiddleWare("organiser"),
  upload.single("image"),
  createProgramme,
);

// 2. get all published programmes
router.get("/all-programmes", getAllProgrammes);

// 3. get my programmes for registered user
router.get("/my-programmes", authMiddleWare, getMyProgrammes);

// 4. get programme by id
router.get("/:slug", getProgrammeBySlug);

// 5. update programme
router.patch(
  "/:id",
  authMiddleWare,
  // roleMiddleWare("organiser"),
  updateProgramme,
);

// 6. delete programme
router.delete(
  "/:id",
  authMiddleWare,
  // roleMiddleWare("organiser"),
  deleteProgramme,
);

//
router.patch(
  "/status/:id",
  authMiddleWare,
  // roleMiddleWare("organiser", "check_in_staff", "owner", "manager", "editor"),
  changeProgrammeStatus,
);

export default router;
