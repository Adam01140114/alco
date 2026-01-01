// server.js
const express = require("express");
const dotenv = require("dotenv");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const pdfParse = require("pdf-parse");
const os = require("os");
dotenv.config();

// Admin Configuration
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD is not set in the environment. Please add it to your .env file.");
}

// Firebase Configuration
const requiredFirebaseEnvVars = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_PRIVATE_KEY_ID",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_CLIENT_ID",
];

for (const envVar of requiredFirebaseEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} is not set in the environment. Please add it to your .env file.`);
  }
}

const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");
const path = require("path");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const cors = require("cors");
const fs = require("fs");

const app = express();

// IMPORTANT: This server runs from /WorkOrder on Render
const WORKORDER_DIR = __dirname;                 // /.../src/WorkOrder
const REPO_ROOT_DIR = path.join(__dirname, ".."); // /.../src

const PUBLIC_DIR = path.join(WORKORDER_DIR, "public");          // WorkOrder/public
const TIMESHEETS_DIR = path.join(REPO_ROOT_DIR, "Timesheets");  // repo root Timesheets

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(cors());

// ────────────────────────────────────────────────────────────
// Firebase
// ────────────────────────────────────────────────────────────
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
});
const db = admin.firestore();

// ────────────────────────────────────────────────────────────
// Static routing (Landing page at /, WorkOrders at /WorkOrders)
// ────────────────────────────────────────────────────────────

// 1) Work Orders UI at /WorkOrders (served from WorkOrder/public)
app.use("/WorkOrders", express.static(PUBLIC_DIR));

// (Optional) keep your old path working if you ever used it
app.get(["/Workorder", "/Workorder/*"], (req, res) => {
  const rest = req.originalUrl.replace(/^\/Workorder/i, "");
  res.redirect(301, `/WorkOrders${rest}`);
});

// 2) Timesheets at /Timesheets
app.use("/Timesheets", express.static(TIMESHEETS_DIR));

// 3) Landing page at /
app.get("/", (_req, res) => {
  res.sendFile(path.join(REPO_ROOT_DIR, "index.html"));
});

// 4) Landing assets (script.js, logo.jpg, etc) live in repo root
// index:false prevents this from hijacking "/" away from the route above.
app.use(express.static(REPO_ROOT_DIR, { index: false }));

// 5) Deep-link fallback for SPAs (optional but usually helpful)
app.get(["/WorkOrders", "/WorkOrders/*"], (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get(["/Timesheets", "/Timesheets/*"], (_req, res) => {
  res.sendFile(path.join(TIMESHEETS_DIR, "index.html"));
});

// ────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────

// Admin authentication endpoint
app.post("/api/admin-login", (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: "Password is required",
      });
    }

    if (password === ADMIN_PASSWORD) {
      return res.json({
        success: true,
        message: "Authentication successful",
      });
    }

    return res.status(401).json({
      success: false,
      error: "Invalid password",
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error during authentication",
    });
  }
});

// Admin forms data endpoint
app.get("/api/admin-forms", async (_req, res) => {
  try {
    console.log("Loading forms for admin console...");

    const formsRef = db.collection("forms");
    const snapshot = await formsRef.get();

    const formsData = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      formsData.push({
        id: doc.id,
        ...data,
      });
    });

    console.log(`Found ${formsData.length} forms for admin console`);
    return res.json({
      success: true,
      forms: formsData,
    });
  } catch (error) {
    console.error("Error loading admin forms:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load forms data",
    });
  }
});

// Admin save forms endpoint
app.post("/api/admin-save-forms", async (req, res) => {
  try {
    const { forms } = req.body;

    if (!forms || !Array.isArray(forms)) {
      return res.status(400).json({
        success: false,
        error: "Forms data is required",
      });
    }

    console.log(`Saving ${forms.length} forms to Firebase...`);

    const batch = db.batch();
    const formsRef = db.collection("forms");

    const snapshot = await formsRef.get();
    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    forms.forEach((form) => {
      const docRef = formsRef.doc(form.id || form.name);
      batch.set(docRef, form);
    });

    await batch.commit();

    console.log(`Successfully saved ${forms.length} forms to Firebase`);
    return res.json({
      success: true,
      message: `Successfully saved ${forms.length} forms`,
    });
  } catch (error) {
    console.error("Error saving admin forms:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to save forms data",
    });
  }
});

// Admin delete form endpoint
app.delete("/api/admin-delete-form/:formId", async (req, res) => {
  try {
    const { formId } = req.params;

    if (!formId) {
      return res.status(400).json({
        success: false,
        error: "Form ID is required",
      });
    }

    console.log(`Deleting form ${formId} from Firebase...`);
    await db.collection("forms").doc(formId).delete();

    console.log(`Successfully deleted form ${formId} from Firebase`);
    return res.json({
      success: true,
      message: "Form deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting admin form:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete form",
    });
  }
});

// Debug endpoint to check forms in source database
app.get("/api/debug-forms", async (_req, res) => {
  try {
    const sourceProjectId = "invoice-4f2b4";

    const sourceApp = admin.initializeApp(
      {
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${sourceProjectId}.firebaseio.com`,
      },
      "debugSourceApp"
    );

    const sourceDb = sourceApp.firestore();

    const snapshot = await sourceDb.collection("forms").get();
    const forms = [];

    snapshot.forEach((doc) => {
      const formData = doc.data();
      forms.push({
        id: doc.id,
        name: formData.name || "Unnamed",
        description: formData.description || "No description",
        counties: formData.counties || [],
      });
    });

    await sourceApp.delete();

    return res.json({
      success: true,
      projectId: sourceProjectId,
      totalForms: forms.length,
      forms,
    });
  } catch (error) {
    console.error("Debug error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// helper
function shouldCheck(v) {
  if (v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  const s = String(v).trim().toLowerCase();
  return s !== "" && s !== "false" && s !== "off" && s !== "no";
}

/**
 * Map HTML form values to PDF radio group options
 */
function mapRadioValue(field, value) {
  try {
    const options = field.getOptions();
    const valueStr = String(value).trim();

    if (options.includes(valueStr)) return valueStr;

    if (valueStr === "on" || valueStr === "true" || valueStr === "1") {
      const yesOption = options.find(
        (opt) =>
          opt.toLowerCase().includes("yes") ||
          opt.toLowerCase().includes("true") ||
          opt.toLowerCase().includes("1")
      );
      if (yesOption) return yesOption;
      if (options.length > 0) return options[0];
    }

    if (valueStr === "off" || valueStr === "false" || valueStr === "0") {
      const noOption = options.find(
        (opt) =>
          opt.toLowerCase().includes("no") ||
          opt.toLowerCase().includes("false") ||
          opt.toLowerCase().includes("0")
      );
      if (noOption) return noOption;
    }

    if (valueStr.includes(",")) {
      const parts = valueStr.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) return mapRadioValue(field, parts[0]);
    }

    const partialMatch = options.find(
      (opt) =>
        opt.toLowerCase().includes(valueStr.toLowerCase()) ||
        valueStr.toLowerCase().includes(opt.toLowerCase())
    );
    if (partialMatch) return partialMatch;

    console.log(
      `Could not map radio value "${valueStr}" to any option in field ${field.getName()}. Available options: ${options.join(", ")}`
    );
    return null;
  } catch (error) {
    console.error(`Error mapping radio value for field ${field.getName()}:`, error.message);
    return null;
  }
}

/**
 * POST /edit_pdf
 */
app.post("/edit_pdf", async (req, res) => {
  let pdfBytes;
  let outputName = "Edited_document.pdf";

  if (req.files && req.files.pdf) {
    pdfBytes = req.files.pdf.data;
    outputName = `Edited_${req.files.pdf.name}`;
    console.log(`Using uploaded PDF: ${req.files.pdf.name}`);
  } else {
    const pdfName = req.query.pdf;
    if (!pdfName) {
      return res.status(400).send("No PDF provided (upload a file or pass ?pdf=filename).");
    }
    const sanitized = path.basename(pdfName) + ".pdf";
    const pdfPath = path.join(PUBLIC_DIR, sanitized);
    if (!fs.existsSync(pdfPath)) {
      return res.status(400).send("Requested PDF does not exist on the server.");
    }
    pdfBytes = await fs.promises.readFile(pdfPath);
    outputName = `Edited_${sanitized}`;
    console.log(`Using server PDF: ${sanitized}`);
  }

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);

  form.getFields().forEach((field) => {
    const key = field.getName();
    const value = req.body[key];
    if (value === undefined) return;

    try {
      switch (field.constructor.name) {
        case "PDFCheckBox": {
          const shouldBeChecked = shouldCheck(value);
          shouldBeChecked ? field.check() : field.uncheck();
          break;
        }
        case "PDFRadioGroup": {
          const radioValue = mapRadioValue(field, value);
          if (radioValue) field.select(radioValue);
          break;
        }
        case "PDFDropdown":
          field.select(String(value));
          break;
        case "PDFTextField":
          field.setText(String(value));
          field.updateAppearances(helv);
          break;
        case "PDFSignature":
          break;
        default:
          if (typeof field.setText === "function") {
            field.setText(String(value));
            if (typeof field.updateAppearances === "function") field.updateAppearances(helv);
          }
          break;
      }
    } catch (error) {
      console.error(`Error processing field ${key} of type ${field.constructor.name}:`, error.message);
    }
  });

  const edited = await pdfDoc.save();
  return res
    .set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${outputName}"`,
    })
    .send(Buffer.from(edited));
});

// PDF to Word Conversion
app.post("/convert-pdf-to-word", async (req, res) => {
  try {
    if (!req.files || !req.files.pdf) {
      return res.status(400).json({ error: "No PDF file uploaded" });
    }

    const pdfFile = req.files.pdf;
    const pdfData = await pdfParse(pdfFile.data);

    const children = [];

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Converted from PDF: " + (pdfFile.name || "Unknown"),
            bold: true,
            size: 24,
          }),
        ],
      })
    );

    if (pdfData.text && pdfData.text.trim().length > 0) {
      const paragraphs = pdfData.text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      paragraphs.forEach((paragraph) => {
        const cleanText = paragraph.replace(/\s+/g, " ").replace(/\n/g, " ").trim();
        if (cleanText.length > 0) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: cleanText,
                  size: 22,
                }),
              ],
            })
          );
        }
      });
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    const originalName = pdfFile.name || "document";
    const outputFilename = path.basename(originalName, ".pdf") + "_converted.docx";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${outputFilename}"`);
    res.setHeader("Content-Length", buffer.length);

    return res.send(buffer);
  } catch (error) {
    console.error("PDF to Word conversion error:", error);
    return res.status(500).json({
      error: "Conversion failed: " + error.message,
    });
  }
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
