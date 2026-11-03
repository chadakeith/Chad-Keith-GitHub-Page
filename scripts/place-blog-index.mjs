import { renameSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../dist/blog.html", import.meta.url));
const to = fileURLToPath(new URL("../dist/blog/index.html", import.meta.url));
renameSync(from, to);
