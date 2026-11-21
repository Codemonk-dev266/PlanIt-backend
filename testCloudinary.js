import cloudinary from "./src/config/cloudinary.js";

const testUpload = async () => {
  try {
    const result = await cloudinary.uploader.upload("./test-image.jpg", {
      folder: "planit/test",
      resource_type: "image",
    });

    console.log("UPLOAD SUCCESSFUL!");
    console.log(result.secure_url);
  } catch (error) {
    console.error("UPLOAD FAILED:");
    console.dir(error, { depth: null });
  }
};

testUpload();
