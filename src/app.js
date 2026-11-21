import express from "express";
import dotenv from "dotenv";
import cors from "cors"

dotenv.config();

const app = express();

app.use(express.json());

// Configure CORS
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      
    ],
    credentials: true,
  })
);

export default app;
