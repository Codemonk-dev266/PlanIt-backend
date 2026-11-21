import cloudinary from "../config/cloudinary.js";
// import Readable from "stream";

const uploadToCloudinary = async (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "planit/programmes", resource_type: "image" },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      },
    );
    stream.end(fileBuffer);
  });
};

export default uploadToCloudinary;
