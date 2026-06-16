import sharp from "sharp";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svg = readFileSync(join(root, "icons", "favicon.svg"));

const sizes = [
    ["favicon-32.png", 32],
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512]
];

for (const [name, size] of sizes) {
    await sharp(svg, { density: 300 })
        .resize(size, size)
        .png()
        .toFile(join(root, "icons", name));
    console.log(`icons/${name} (${size}x${size})`);
}
