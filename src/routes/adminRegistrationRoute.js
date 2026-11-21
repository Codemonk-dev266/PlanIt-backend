import express from "express";

import { adminCorrectCheckIn } from "../controllers/adminRegistrationController.js";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import adminMiddleWare from "../middleWare/adminMiddleWare.js";

const router = express.Router();

router.patch(
  "/:id/check-in",
  authMiddleWare,
  adminMiddleWare,
  adminCorrectCheckIn,
);

export default router;
