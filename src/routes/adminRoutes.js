import express from "express";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import adminMiddleWare from "../middleWare/adminMiddleWare.js";

const router = express.Router();

router.get("/dashboard", authMiddleWare, adminMiddleWare, (req, res) => {
  return res.status(200).json({
    message: "Admin access granted",
    admin: {
      id: req.user.userId,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

export default router;
