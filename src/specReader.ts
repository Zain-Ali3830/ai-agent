import * as fs from "fs";
import * as path from "path";

async function readTxt(filePath: string): Promise<string> {
  return fs.readFileSync(filePath, "utf-8");
}

async function readPdf(filePath: string): Promise<string> {
  const pdfParse = require("pdf-parse");
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function readDocx(filePath: string): Promise<string> {
  const mammoth = require("mammoth");
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function readSpecFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Spec file not found: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  let text: string;

  switch (ext) {
    case ".txt":
      text = await readTxt(resolved);
      break;
    case ".pdf":
      text = await readPdf(resolved);
      break;
    case ".docx":
      text = await readDocx(resolved);
      break;
    default:
      throw new Error(
        `Unsupported spec file type "${ext}". Supported: .txt, .pdf, .docx`
      );
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`Spec file "${resolved}" appears to be empty.`);
  }
  return trimmed;
}
