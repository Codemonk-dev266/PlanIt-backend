import mongoose from "mongoose";

const adminControlSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: "admin-control",
    },
    revision: {
      type: Number,
      default: 0,
    },
  },
  {
    versionKey: false,
  },
);

const AdminControl = mongoose.model("AdminControl", adminControlSchema);

export default AdminControl;
