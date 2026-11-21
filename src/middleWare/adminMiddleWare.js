const adminMiddleWare = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    if (!req.user.isActive) {
      return res.status(403).json({
        message: "Your admin account has been deactivated",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

export default adminMiddleWare;
