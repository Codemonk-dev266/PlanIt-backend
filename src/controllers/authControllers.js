import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import User from "../models/userModels.js";
import uploadToCloudinary from "../utils/uploadToCloudinary.js";

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "5d" });
};

// Register
export const Register = async (req, res, next) => {
  try {
    const { name, email, password, phone_number, role } = req.body;

    // Only these roles can be selected during public registration
    const allowedRoles = ["organiser", "member"];

    const accountRole = role || "member";

    if (!allowedRoles.includes(accountRole)) {
      return res.status(400).json({
        message: "Invalid account type",
      });
    }

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    // Validate data types
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Invalid input data",
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 5 || normalizedName.length > 30) {
      return res.status(400).json({
        message: "Name must be between 5 and 30 characters",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please provide a valid email address",
      });
    }

    if (
      password.length < 8 ||
      password.length > 50 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        message: "Password must be between 8 and 50 characters",
      });
    }

    if (
      phone_number !== undefined &&
      phone_number !== null &&
      typeof phone_number !== "string"
    ) {
      return res.status(400).json({
        message: "Invalid phone number",
      });
    }

    // Check existing account
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    // Upload image only after validating the submitted data
    let image = {};

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);

      image = {
        url: result.secure_url,
        public_id: result.public_id,
      };
    }

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password,
      phone_number: phone_number?.trim() || null,
      image,

      // Public registration creates  allowedRoles only
      role: accountRole,
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        userId: user._id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        image: user.image,
        role: user.role,
      },
    });
  } catch (error) {
    // Handles duplicate email submissions occurring concurrently
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    next(error);
  }
};

// Login
export const Login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Block deactivated accounts
    if (!user.isActive) {
      return res.status(403).json({
        message: "Your account has been deactivated",
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        userId: user._id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        image: user.image,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// getMe
export const GetMe = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "User details fetched successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

// Log out
export const Logout = async (req, res, next) => {
  try {
    return res.status(200).json({
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
};
