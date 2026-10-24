import { cpSync, existsSync, rmSync, mkdirSync } from "node:fs";
if (!existsSync("public/index.html")) throw new Error("public/index.html is missing");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
console.log("Build OK: public -> dist");
