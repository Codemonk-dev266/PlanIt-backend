
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../src/config/mongodb.js";
import User from "../src/models/userModels.js";
import AdminControl from "../src/models/adminControlModel.js";

const createFirstAdmin = async () => {
  let session;

  try {
    const name = process.env.FIRST_ADMIN_NAME?.trim();
    const email = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.FIRST_ADMIN_PASSWORD;

    // Validate environment variables
    if (!name || !email || !password) {
      throw new Error("First admin environment variables are missing");
    }

    if (name.length < 5 || name.length > 30) {
      throw new Error("Admin name must be between 5 and 30 characters");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("A valid admin email is required");
    }

    if (password.length < 8 || password.length > 50) {
      throw new Error("Password must be between 8 and 50 characters");
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
      throw new Error("Password exceeds bcrypt's 72-byte limit");
    }

    await connectDB();

    // Ensure the shared admin-control document exists.
    try {
      await AdminControl.updateOne(
        { _id: "admin-control" },
        { $setOnInsert: { revision: 0 } },
        { upsert: true },
      );
    } catch (error) {
      // Another process may have created it simultaneously.
      if (error.code !== 11000) throw error;
    }

    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      // Acquire the same lock used by admin-management operations.
      const lock = await AdminControl.updateOne(
        { _id: "admin-control" },
        { $inc: { revision: 1 } },
        { session },
      );

      if (lock.matchedCount !== 1) {
        throw new Error("Could not acquire admin-control lock");
      }

      // Only one first admin may be bootstrapped.
      const existingAdmin = await User.exists({
        role: "admin",
      }).session(session);

      if (existingAdmin) {
        throw new Error(
          "An administrator already exists. Bootstrap aborted.",
        );
      }

      const [admin] = await User.create(
        [
          {
            name,
            email,
            password,
            role: "admin",
            isActive: true,
          },
        ],
        { session },
      );

      console.log("First administrator created successfully.");
      console.log("Admin ID:", admin._id.toString());
      console.log("Admin email:", admin.email);
    });
  } catch (error) {
    console.error("First-admin bootstrap failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (session) await session.endSession();
    await mongoose.disconnect();
  }
};

createFirstAdmin();
