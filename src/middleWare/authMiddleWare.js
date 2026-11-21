import jwt from "jsonwebtoken";
import User from "../models/userModels.js";

const authMiddleWare = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // Strictly validate Bearer token format.
    const bearerMatch = authHeader.match(/^Bearer\s+(\S+)$/i);

    if (!bearerMatch) {
      return res.status(401).json({
        message: "Invalid authorization format",
      });
    }

    const token = bearerMatch[1];

    // Verify JWT.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || typeof decoded.userId !== "string") {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    // Retrieve the current user from the database.
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        message: "User does not exist",
      });
    }

    // Prevent deactivated accounts from accessing protected routes.
    if (!user.isActive) {
      return res.status(403).json({
        message: "Your account has been deactivated",
      });
    }

    // Attach authenticated user.
    req.user = {
      userId: user._id.toString(),
      role: user.role,
      isActive: user.isActive,
      name: user.name,
      email: user.email,
    };

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    next(error);
  }
};

export default authMiddleWare;
