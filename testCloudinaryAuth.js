
import cloudinary from "./src/config/cloudinary.js";

const testAuth = async () => {
  try {
    const result = await cloudinary.api.ping();

    console.log("CLOUDINARY AUTHENTICATION SUCCESSFUL");
    console.log(result);
  } catch (error) {
    console.error("CLOUDINARY AUTHENTICATION FAILED");
    console.dir(error, { depth: null });
  }
};

testAuth();
