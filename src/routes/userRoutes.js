import express from "express";
import {
  GetMe,
  Login,
  Logout,
  Register,
} from "../controllers/authControllers.js";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import upload from "../middleWare/uploadMiddleWare.js";

const router = express.Router();

// public route
router.post("/register", upload.single("image"), Register);
router.post("/login", Login);

// protected route
router.get("/me", authMiddleWare, GetMe);
router.post("/logout", authMiddleWare, Logout);

export default router;
