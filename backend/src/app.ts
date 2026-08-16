import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { authRouter } from "./routes/auth";
import { financialRouter } from "./routes/financial";
import { phasesRouter } from "./routes/phases";
import { projectsRouter } from "./routes/projects";
import { subPhasesRouter } from "./routes/subPhases";
import { unitsRouter } from "./routes/units";
import { updatesRouter } from "./routes/updates";
import { usersRouter } from "./routes/users";
import { UnsupportedFileTypeError, uploadsRoot } from "./utils/upload";

export const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsRoot));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/units", unitsRouter);
app.use("/api/phases", phasesRouter);
app.use("/api/sub-phases", subPhasesRouter);
app.use("/api", updatesRouter);
app.use("/api", financialRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof UnsupportedFileTypeError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const maxMb = err.field === "receipt" ? 100 : 15;
      res.status(400).json({ error: `הקובץ גדול מדי (מקסימום ${maxMb}MB)` });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
});
