import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("MONGODB_URI is missing from environment variables");
    }

    await mongoose.connect(uri);

    console.log("mongo_db connected successfully");
  } catch (error) {
    console.error("MongoDb connection failed", error.message);
    process.exit(1);
  }
};

export default connectDB;
