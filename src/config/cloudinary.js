import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  debug: true,
});

console.log(
  cloudinary.config().cloud_name,
  cloudinary.config().api_key ? "API KEY LOADED" : "API KEY MISSING",
  cloudinary.config().api_secret ? "API SECRET LOADED" : "API SECRET MISSING",
);

export default cloudinary;
