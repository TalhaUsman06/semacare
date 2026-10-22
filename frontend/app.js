const CATEGORIES = [
  { name: "Receipts", icon: "🧾", words: ["receipt", "invoice", "bill", "tax", "payment"] },
  { name: "Screenshots", icon: "📱", words: ["screenshot", "screen-shot", "screen_shot", "screen shot", "capture"] },
  { name: "Landscapes", icon: "🏞️", words: ["landscape", "mountain", "beach", "sunset", "nature", "sea"] },
  { name: "People", icon: "🧑", words: ["person", "people", "portrait", "family", "friend", "selfie"] },
  { name: "Memes", icon: "😂", words: ["meme", "funny", "lol"] },
  { name: "Junk", icon: "🗑️", words: ["junk", "blurry", "blur", "blank", "empty"] },
  { name: "Other", icon: "📁", words: [] },
];
const SENSITIVE_FILTER = "Sensitive alerts";
const MAX_IMAGES = 500;

const elements = {
  authStatus: document.querySelector("#auth-status"),
  authForm: document.querySelector("#auth-form"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  metadataConsent: document.querySelector("#metadata-consent"),
  aiUploadConsent: document.querySelector("#ai-upload-consent"),
  signIn: document.querySelector("#sign-in"),
  signUp: document.querySelector("#sign-up"),
  signOut: document.querySelector("#sign-out"),
  eraseCloudScan: document.querySelector("#erase-cloud-scan"),
  chooseFolder: document.querySelector("#choose-folder"),
  startStep: document.querySelector("#start-step"),
  chooseFiles: document.querySelector("#choose-files"),
  folderInput: document.querySelector("#folder-input"),
  filesInput: document.querySelector("#files-input"),
  folderSummary: document.querySelector("#folder-summary"),
  processingStatus: document.querySelector("#processing-status"),
  processingPhase: document.querySelector("#processing-phase"),
  processingPercent: document.querySelector("#processing-percent"),
  processingProgressFill: document.querySelector("#processing-progress-fill"),
  processingProgress: document.querySelector("#processing-status .processing-bar"),
  processingEta: document.querySelector("#processing-eta"),
  localAiConsent: document.querySelector("#local-ai-consent"),
  results: document.querySelector("#results"),
  categoryGrid: document.querySelector("#category-grid"),
  imageGrid: document.querySelector("#image-grid"),
  binGrid: document.querySelector("#bin-grid"),
  categoriesView: document.querySelector("#categories-view"),
  binView: document.querySelector("#bin-view"),
  viewCategories: document.querySelector("#view-categories"),
  viewBin: document.querySelector("#view-bin"),
  viewArchive: document.querySelector("#view-archive"),
  viewInformation: document.querySelector("#view-information"),
  binCount: document.querySelector("#bin-count"),
  archiveView: document.querySelector("#archive-view"),
  archiveSearch: document.querySelector("#archive-search"),
  clearArchive: document.querySelector("#clear-archive"),
  archiveSummary: document.querySelector("#archive-summary"),
  archiveList: document.querySelector("#archive-list"),
  selectionCount: document.querySelector("#selection-count"),
  selectVisible: document.querySelector("#select-visible"),
  clearSelection: document.querySelector("#clear-selection"),
  exportCsv: document.querySelector("#export-csv"),
  exportInfoCsv: document.querySelector("#export-info-csv"),
  exportInfoJson: document.querySelector("#export-info-json"),
  exportImages: document.querySelector("#export-images"),
  moveToBin: document.querySelector("#move-to-bin"),
  emptyBin: document.querySelector("#empty-bin"),
  toast: document.querySelector("#toast"),
  accountToggle: document.querySelector("#account-toggle"),
  accountPanel: document.querySelector("#account"),
  accountClose: document.querySelector("#account-close"),
  journeyTracker: document.querySelector("#journey-tracker"),
  journeyStatus: document.querySelector("#journey-status"),
  journeyProgressFill: document.querySelector("#journey-progress-fill"),
};

const config = window.SEMACARE_CONFIG;
const supabaseLibrary = window.supabase;
let supabaseClient = null;
let supabaseInitError = null;
let apiBaseUrl = "";
let apiInitError = null;
let localModelPromise = null;
let faceModelPromise = null;
let ocrWorkerPromise = null;
let localInformationDbPromise = null;
let ocrQueue = Promise.resolve();
if (config?.apiUrl) {
  try {
    const apiUrl = new URL(config.apiUrl);
    if (apiUrl.protocol !== "https:" && apiUrl.hostname !== "localhost") {
      throw new Error("The SEMACARE API URL must use HTTPS.");
    }
    apiBaseUrl = apiUrl.toString().replace(/\/$/, "");
  } catch (error) {
    apiInitError = formatError(error);
  }
}
if (config?.url && config?.publishableKey) {
  if (!supabaseLibrary?.createClient) {
    supabaseInitError = "The Supabase browser library did not load. Check your internet connection.";
  } else {
    try {
      supabaseClient = supabaseLibrary.createClient(config.url, config.publishableKey);
    } catch (error) {
      supabaseInitError = formatError(error);
    }
  }
}

const state = {
  images: [],
  activeCategory: "All",
  activeView: "categories",
  folderName: "",
  user: null,
  currentScanId: null,
  currentScanOwner: null,
  metadataConsent: false,
  aiUploadConsent: false,
  localAiConsent: true,
  rootHandle: null,
  exported: false,
  processing: { active: false, total: 0, completed: 0, startedAt: 0 },
  toastTimer: 0,
};

function showMessage(message, isError = false) {
  elements.folderSummary.textContent = message;
  elements.folderSummary.classList.toggle("is-error", isError);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3200);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "less than a minute";
  const rounded = Math.max(1, Math.round(seconds));
  if (rounded < 60) return `${rounded} sec`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder >= 30 ? `${minutes + 1} min` : `${minutes} min`;
}

function updateProcessingProgress({ phase, completed, total, active = true }) {
  state.processing.active = active;
  state.processing.completed = completed;
  state.processing.total = total;
  if (active && !state.processing.startedAt) state.processing.startedAt = performance.now();

  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  elements.processingStatus.hidden = !active;
  elements.processingPhase.textContent = phase;
  elements.processingPercent.textContent = `${percent}%`;
  elements.processingProgressFill.style.width = `${percent}%`;
  elements.processingProgress.setAttribute("aria-valuenow", String(percent));

  if (!active || completed >= total) {
    elements.processingEta.textContent = "Analysis complete — ready for your review.";
    return;
  }
  if (completed < 5) {
    elements.processingEta.textContent = "Calculating time after the first few images…";
    return;
  }
  const elapsedSeconds = (performance.now() - state.processing.startedAt) / 1000;
  const imagesPerSecond = completed / Math.max(elapsedSeconds, 0.1);
  const remainingSeconds = (total - completed) / imagesPerSecond;
  const lower = formatDuration(remainingSeconds * 0.8);
  const upper = formatDuration(remainingSeconds * 1.25);
  const range = lower === upper ? lower : `${lower}–${upper}`;
  elements.processingEta.textContent = `${completed} of ${total} images · About ${range} remaining`;
}

function renderJourney() {
  const hasPictures = state.images.length > 0;
  const hasDecision = state.images.some((image) => image.selected || image.binned);
  const step = state.exported ? 4 : hasDecision ? 3 : hasPictures ? 2 : 1;
  const labels = ["Select a folder", "Understand your pictures", "Decide what stays", "Export your organised folder"];
  elements.journeyStatus.textContent = `Step ${step} of 4 · ${labels[step - 1]}`;
  elements.journeyProgressFill.style.width = `${step * 25}%`;
  elements.journeyTracker.querySelector(".journey-progress").setAttribute("aria-valuenow", String(step));
  for (const item of elements.journeyTracker.querySelectorAll("[data-journey-step]")) {
    const itemStep = Number(item.dataset.journeyStep);
    item.classList.toggle("is-active", itemStep === step);
    item.classList.toggle("is-complete", itemStep < step);
  }
}

function localCategoryFromLabels(predictions, filename) {
  const filenameCategory = getImageCategory(filename);
  if (filenameCategory !== "Other") {
    return { category: filenameCategory, confidence: 96 };
  }
  const categoryWords = {
    People: ["person", "man", "woman", "boy", "girl", "bride", "groom", "baby", "face", "portrait"],
    Landscapes: ["mountain", "valley", "beach", "seashore", "lakeside", "lake", "forest", "volcano", "desert", "sunset", "sky", "cliff", "coast"],
    Screenshots: ["monitor", "desktop computer", "laptop", "screen", "cellular telephone", "mobile phone", "web site", "website", "notebook computer"],
    Receipts: ["receipt", "invoice", "paper currency"],
    Memes: ["comic book", "cartoon", "comic", "poster"],
  };
  const scores = Object.fromEntries(Object.keys(categoryWords).map((category) => [category, 0]));
  for (const prediction of predictions) {
    const label = prediction.className.toLowerCase();
    const probability = Number(prediction.probability) || 0;
    for (const [category, words] of Object.entries(categoryWords)) {
      if (words.some((word) => label.includes(word))) scores[category] += probability;
    }
  }
  const [category, score] = Object.entries(scores).sort((left, right) => right[1] - left[1])[0];
  if (score < 0.12) return { category: "Other", confidence: Math.round(score * 100) };
  return { category, confidence: Math.min(99, Math.round(score * 100)) };
}

async function classifyImagesLocally(images) {
  if (!window.mobilenet?.load || !window.tf) {
    return false;
  }
  state.processing = { active: true, total: images.length, completed: 0, startedAt: performance.now() };
  updateProcessingProgress({ phase: "Loading local AI models", completed: 0, total: images.length });
  showMessage("Loading local AI model…");
  if (!localModelPromise) {
    localModelPromise = window.mobilenet.load({ version: 2, alpha: 0.5 });
  }
  let model;
  try {
    model = await localModelPromise;
  } catch (error) {
    localModelPromise = null;
    console.warn("Local image model could not be loaded", error);
    updateProcessingProgress({ phase: "Local AI unavailable", completed: 0, total: images.length, active: false });
    showMessage("Local AI model could not be loaded. Filename suggestions remain available.", true);
    return false;
  }
  if (!faceModelPromise && window.blazeface?.load) faceModelPromise = window.blazeface.load();
  let faceModel = null;
  try {
    faceModel = await faceModelPromise;
  } catch (error) {
    faceModelPromise = null;
    console.warn("Local face detector could not be loaded", error);
  }
  updateProcessingProgress({ phase: "Classifying and checking images", completed: 0, total: images.length });

  let next = 0;
  let completed = 0;
  const worker = async () => {
    while (next < images.length) {
      const image = images[next];
      next += 1;
      try {
        image.quality = await analyseImageQuality(image);
        const preview = new Image();
        preview.src = image.previewUrl;
        await preview.decode();
        const predictions = await model.classify(preview, 3);
        const localResult = localCategoryFromLabels(predictions, image.name);
        image.category = localResult.category;
        image.classificationSource = "local_ai";
        image.aiLabels = predictions.map((prediction) => prediction.className);
        image.aiConfidence = localResult.confidence;
        image.faceCount = 0;
        if (faceModel) {
          try {
            const faces = await faceModel.estimateFaces(preview, false);
            image.faceCount = Array.isArray(faces) ? faces.length : 0;
            if (image.faceCount > 0 && localResult.category === "Other") {
              image.category = "People";
              image.aiConfidence = Math.min(99, 78 + image.faceCount * 4);
            }
          } catch (error) {
            console.warn("Face detection failed for", image.name, error);
          }
        }
        image.sensitive = false;
        image.sensitiveReasons = [];
        if (shouldRunOcr(image, predictions)) {
          updateProcessingProgress({ phase: "Reading text in document images", completed, total: images.length });
          const ocrResult = await runLocalOcr(image);
          image.ocrText = ocrResult.text;
          image.ocrConfidence = ocrResult.confidence;
          image.textExtracted = ocrResult.text.length >= 10;
          image.sensitiveReasons = ocrResult.reasons;
          image.sensitive = image.sensitiveReasons.length > 0;
        }
        image.ocrProcessed = true;
        const documentEvidence = predictions.some((prediction) => /text|receipt|paper|document|screen|monitor|menu|website|book|invoice/.test(prediction.className.toLocaleLowerCase()));
        if (image.quality.junk && !image.ocrText && !documentEvidence) {
          image.category = "Junk";
          image.classificationSource = "local_quality_check";
          image.aiConfidence = 90;
        }
      } catch (error) {
        console.warn("Local image classification failed", image.name, error);
      }
      completed += 1;
      updateProcessingProgress({ phase: "Classifying and checking images", completed, total: images.length });
      if (completed % 5 === 0 || completed === images.length) {
        const percentage = Math.round((completed / images.length) * 100);
        showMessage(`Local AI processing: ${completed}/${images.length} complete (${percentage}%).`);
        render();
      }
    }
  };
  await Promise.all([worker(), worker()]);
  await persistLocalInformationRecords(images).catch((error) => {
    console.warn("Could not persist the local information index", error);
  });
  updateProcessingProgress({ phase: "Analysis complete", completed: images.length, total: images.length });
  return true;
}

function setAuthStatus(message, isError = false) {
  elements.authStatus.textContent = message;
  elements.authStatus.classList.toggle("is-error", isError);
}

function updateAuthView(user) {
  state.user = user;
  const signedIn = Boolean(user);
  elements.authEmail.disabled = signedIn || !supabaseClient;
  elements.authPassword.disabled = signedIn || !supabaseClient;
  elements.metadataConsent.disabled = !supabaseClient;
  // AWS is intentionally paused while the local-first workflow is being validated.
  elements.aiUploadConsent.disabled = true;
  elements.signIn.hidden = signedIn;
  elements.signUp.hidden = signedIn;
  elements.signOut.hidden = !signedIn;
  elements.eraseCloudScan.hidden = !signedIn;
  if (signedIn) {
    const aiStatus = " AWS image processing is temporarily paused; local AI and OCR remain available.";
    setAuthStatus(state.metadataConsent
      ? `Signed in as ${user.email}. Scan metadata will be saved when you choose pictures.${aiStatus}`
      : `Signed in as ${user.email}. Metadata sync is off until you give consent.${aiStatus}`);
  } else if (supabaseInitError) {
    setAuthStatus(`Supabase could not be initialized: ${supabaseInitError}. The local organiser still works.`, true);
  } else if (!supabaseClient) {
    setAuthStatus("Supabase is not configured. The local organiser still works.");
  } else {
    setAuthStatus("Not signed in. Pictures and categories will stay in this browser only.");
  }
}

async function authenticate(action) {
  if (!supabaseClient) {
    setAuthStatus("Supabase is not configured. Follow the setup steps in README.md.", true);
    return;
  }
  if (!elements.authForm.reportValidity()) return;
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  elements.signIn.disabled = true;
  elements.signUp.disabled = true;
  try {
    if (action === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session?.user) {
        updateAuthView(data.session.user);
      } else {
        setAuthStatus("Account created. Check your email if confirmation is enabled, then sign in.");
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    setAuthStatus(`Could not ${action === "signup" ? "create the account" : "sign in"}: ${formatError(error)}`, true);
  } finally {
    elements.signIn.disabled = false;
    elements.signUp.disabled = false;
  }
}

async function initializeAuth() {
  if (!supabaseClient) {
    updateAuthView(null);
    elements.signIn.disabled = true;
    elements.signUp.disabled = true;
    return;
  }
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    updateAuthView(data.session?.user ?? null);
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        state.metadataConsent = false;
        state.aiUploadConsent = false;
        elements.metadataConsent.checked = false;
        elements.aiUploadConsent.checked = false;
      }
      updateAuthView(session?.user ?? null);
    });
  } catch (error) {
    setAuthStatus(`Could not check your Supabase session: ${formatError(error)}`, true);
  }
}

function getImageCategory(fileName) {
  const normalizedName = fileName.toLocaleLowerCase().replaceAll("-", " ");
  const match = CATEGORIES.find(
    (category) => category.name !== "Other" && category.words.some((word) => normalizedName.includes(word)),
  );
  return match?.name ?? "Other";
}

function getImageFiles(files) {
  return [...files].filter((file) => {
    const extension = file.name.split(".").pop()?.toLocaleLowerCase();
    return ["jpg", "jpeg", "png", "webp"].includes(extension ?? "");
  });
}

async function analyseImageQuality(image) {
  const bitmap = await createImageBitmap(image.file);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const width = Math.max(1, Math.min(96, sourceWidth));
  const height = Math.max(1, Math.min(96, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return { junk: false, reason: "" };
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height).data;
  const luminance = [];
  for (let index = 0; index < pixels.length; index += 4) {
    luminance.push(0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]);
  }
  const mean = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  const variance = luminance.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luminance.length;
  let edgeEnergy = 0;
  let edgeCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const current = luminance[y * width + x];
      if (x + 1 < width) {
        edgeEnergy += Math.abs(current - luminance[y * width + x + 1]);
        edgeCount += 1;
      }
      if (y + 1 < height) {
        edgeEnergy += Math.abs(current - luminance[(y + 1) * width + x]);
        edgeCount += 1;
      }
    }
  }
  const edgeScore = edgeEnergy / Math.max(1, edgeCount);
  if (variance < 30 || (variance < 70 && edgeScore < 1.5)) return { junk: true, reason: "Blank or nearly blank" };
  if (edgeScore < 1.1 && variance < 600) return { junk: true, reason: "Very low visual detail; review for blur" };
  return { junk: false, reason: "" };
}

function sensitivityReasons(text) {
  const normalized = text.toLocaleLowerCase().replace(/\s+/g, " ");
  const reasons = new Set();
  if (/\b(address|postcode|post code|zip code|street|road|avenue|lane|flat|apartment|county)\b/.test(normalized)
    || /\b[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}\b/i.test(text)) {
    reasons.add("Address or location");
  }
  if (/\b(bank|banking|statement|sort code|iban|swift|routing number|account number|account no|balance|transaction|debit|credit|mortgage)\b/.test(normalized)
    || /\b\d{8}\b/.test(normalized)) {
    reasons.add("Banking or account details");
  }
  if (/\b(pkr|rs\.?|transaction amount|from account|account title|beneficiary|customer name|beneficiary name|amount paid|amount received)\b/.test(normalized)) {
    reasons.add("Financial transaction or customer details");
  }
  if (/\b(visa|mastercard|amex|card number|expiry|expires|cvv|cvc)\b/.test(normalized)
    || /\b(?:\d[ -]?){13,19}\b/.test(normalized)) {
    reasons.add("Payment card details");
  }
  if (/\b(passport|canada|nationality|surname|given name|date of issue|date of expiry|place of birth|issuing authority|document no|passport no|driving licence|driver license|national insurance|social security|nhs|date of birth|dob)\b/.test(normalized)) {
    reasons.add("Identity details");
  }
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) reasons.add("Email address");
  if (/(?:\+?\d[\d ()-]{8,}\d)/.test(text)) reasons.add("Phone number");
  return [...reasons];
}

function cleanOcrText(text) {
  const lines = [...new Set(String(text || "")
    .normalize("NFKC")
    .split(/\r?\n/)
    .map((line) => {
      const safe = line.replace(/[^\p{L}\p{N}\s.,:;!?%&@£$€'/-]/gu, " ");
      const words = safe.split(/\s+/).filter((word) => word.replace(/[^\p{L}\p{N}]/gu, "").length >= 2);
      return words.join(" ").replace(/\s+([,.;!?])/g, "$1").trim();
    })
    .filter((line) => line.length >= 3)
    .filter((line) => {
      const alphanumeric = (line.match(/[\p{L}\p{N}]/gu) || []).length;
      const symbols = (line.match(/[^\p{L}\p{N}\s]/gu) || []).length;
      return alphanumeric >= 3 && symbols <= alphanumeric;
    }))];
  return lines.join("\n").replace(/[ \t]+/g, " ").trim().slice(0, 4000);
}

function ocrQuality(text, confidence) {
  const value = String(text || "");
  const words = value.match(/[\p{L}\p{N}]{2,}/gu) || [];
  const alphanumeric = (value.match(/[\p{L}\p{N}]/gu) || []).length;
  const symbols = (value.match(/[^\p{L}\p{N}\s]/gu) || []).length;
  const symbolPenalty = symbols > alphanumeric ? 40 : symbols / Math.max(1, alphanumeric) * 20;
  return (Number(confidence) || 0) + Math.min(30, words.length) + Math.min(20, alphanumeric / 30) - symbolPenalty;
}

function meaningfulFields(text) {
  const value = String(text || "");
  const fields = [];
  if (/\b[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}\b/i.test(value)) fields.push("address/postcode");
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(value)) fields.push("email");
  if (/(?:\+?\d[\d ()-]{8,}\d)/.test(value)) fields.push("phone");
  if (/\b(bank|banking|statement|sort code|iban|swift|routing number|account number|balance|transaction|debit|credit|mortgage)\b/i.test(value)) fields.push("bank/account");
  if (/\b(visa|mastercard|amex|card number|expiry|expires|cvv|cvc)\b/i.test(value)) fields.push("payment card");
  if (/\b(passport|nationality|surname|given name|date of issue|date of expiry|place of birth|driving licence|driver license|national insurance|social security|nhs|date of birth|dob)\b/i.test(value)) fields.push("identity document");
  return fields;
}

function csvCell(value) {
  const singleLine = String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return `"${singleLine.replaceAll('"', '""')}"`;
}

function downloadCsv(rows, filename) {
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const downloadUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function downloadJson(value, filename) {
  const json = JSON.stringify(value, null, 2);
  const downloadUrl = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function informationRecord(image) {
  return {
    id: image.id,
    filename: image.name,
    relative_path: image.path || image.name,
    category: image.category || "Other",
    classification_source: image.classificationSource || "filename_guess",
    sensitive: Boolean(image.sensitive),
    sensitive_reasons: [...(image.sensitiveReasons || [])],
    meaningful_fields: meaningfulFields(image.ocrText),
    extracted_text: image.ocrText || "",
    ocr_confidence: image.ocrConfidence ?? null,
    ocr_processed: Boolean(image.ocrProcessed),
    face_count: image.faceCount || 0,
    status: image.permanentlyDeleted ? "image_deleted" : image.binned ? "local_bin" : "in_review",
    binned_at: image.binnedAt || null,
    export_name: image.exportName || null,
    updated_at: new Date().toISOString(),
  };
}

function getLocalInformationDb() {
  if (!window.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  if (!localInformationDbPromise) {
    localInformationDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open("semacare-information", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.createObjectStore("records", { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("sensitive", "sensitive", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open the local information index."));
    });
  }
  return localInformationDbPromise;
}

async function persistLocalInformation(image) {
  const db = await getLocalInformationDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("records", "readwrite");
    transaction.objectStore("records").put(informationRecord(image));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Could not save local image information."));
  });
}

async function persistLocalInformationRecords(images) {
  if (!images.length) return;
  const db = await getLocalInformationDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("records", "readwrite");
    const store = transaction.objectStore("records");
    for (const image of images) store.put(informationRecord(image));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Could not save the local information index."));
  });
}

async function readLocalInformationRecords() {
  const db = await getLocalInformationDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("records", "readonly").objectStore("records").getAll();
    request.onsuccess = () => resolve(request.result.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at))));
    request.onerror = () => reject(request.error || new Error("Could not read the local information archive."));
  });
}

async function clearLocalInformationRecords() {
  const db = await getLocalInformationDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("records", "readwrite");
    transaction.objectStore("records").clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Could not clear the local information archive."));
  });
}

async function renderInformationArchive() {
  elements.archiveList.replaceChildren();
  try {
    const records = await readLocalInformationRecords();
    const query = elements.archiveSearch.value.trim().toLocaleLowerCase();
    const filtered = records.filter((record) => {
      if (!query) return true;
      return [record.filename, record.relative_path, record.category, record.extracted_text, ...(record.meaningful_fields || []), ...(record.sensitive_reasons || [])]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
    elements.archiveSummary.textContent = `${filtered.length} saved record(s)${query ? ` matching “${query}”` : ""}. Original image files are not stored here.`;
    if (filtered.length === 0) {
      elements.archiveList.append(createElement("p", "empty-state", query ? "No saved information matches that search." : "No persistent information has been indexed yet."));
      return;
    }
    for (const record of filtered) {
      const item = createElement("article", "archive-record");
      item.classList.toggle("is-deleted", record.status === "image_deleted");
      const main = createElement("div", "archive-record-main");
      const title = createElement("strong", "", record.filename);
      title.title = record.relative_path;
      const status = record.status === "image_deleted" ? "Original deleted" : `${record.category} · ${record.status}`;
      const text = createElement("p", "archive-record-text", record.extracted_text || "No meaningful text extracted.");
      const fields = record.meaningful_fields?.length
        ? createElement("p", "archive-record-fields", `Key details: ${record.meaningful_fields.join(" · ")}`)
        : null;
      const meta = createElement("small", "", `${status}${record.sensitive ? " · Sensitive" : ""}`);
      const raw = createElement("details", "archive-record-json");
      raw.append(createElement("summary", "", "View record JSON"));
      raw.append(createElement("pre", "", JSON.stringify(record, null, 2)));
      main.append(title, text);
      if (fields) main.append(fields);
      main.append(raw);
      item.append(main, meta);
      elements.archiveList.append(item);
    }
  } catch (error) {
    elements.archiveSummary.textContent = `The local archive is unavailable: ${formatError(error)}`;
  }
}

function textSegments(text) {
  return String(text || "")
    .split(/\r?\n|(?<=[.!?])\s+/u)
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter((segment) => segment.length >= 3)
    .slice(0, 30);
}

function isMeaningfulOcrText(text, confidence) {
  const value = String(text || "").trim();
  const tokens = value.match(/[\p{L}\p{N}]{2,}/gu) || [];
  const longWords = tokens.filter((token) => /[\p{L}]{4,}/u.test(token));
  const letters = (value.match(/[\p{L}]/gu) || []).length;
  const digits = (value.match(/[\p{N}]/gu) || []).length;
  const noise = (value.match(/[^\p{L}\p{N}\s.,:;!?%&@£$€'/-]/gu) || []).length;
  const alphaNumeric = letters + digits;
  if (Number(confidence) < 35 || tokens.length < 4 || longWords.length < 2) return false;
  if (alphaNumeric < 12 || noise > alphaNumeric * 0.2) return false;
  const averageWordLength = tokens.reduce((sum, token) => sum + token.length, 0) / tokens.length;
  return averageWordLength >= 3;
}

async function getOcrWorker() {
  if (!window.Tesseract?.createWorker) return null;
  if (!ocrWorkerPromise) ocrWorkerPromise = window.Tesseract.createWorker("eng");
  return ocrWorkerPromise;
}

async function rotatedImageSources(image) {
  const preview = new Image();
  preview.src = image.previewUrl;
  await preview.decode();
  const sources = [image.previewUrl];
  for (const angle of [90, 270]) {
    const canvas = document.createElement("canvas");
    canvas.width = preview.naturalHeight;
    canvas.height = preview.naturalWidth;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(angle * Math.PI / 180);
    context.drawImage(preview, -preview.naturalWidth / 2, -preview.naturalHeight / 2);
    sources.push(canvas.toDataURL("image/jpeg", 0.82));
  }
  return sources;
}

function runLocalOcr(image) {
  const job = ocrQueue.then(async () => {
    const worker = await getOcrWorker();
    if (!worker) return { reasons: [], text: "", confidence: 0 };
    const sources = await rotatedImageSources(image);
    const candidates = [];
    for (const source of sources) {
      const result = await worker.recognize(source);
      const text = result.data?.text || "";
      const confidence = Number(result.data?.confidence) || 0;
      candidates.push({ text, confidence, quality: ocrQuality(text, confidence) });
    }
    const best = candidates.sort((left, right) => right.quality - left.quality)[0] || { text: "", confidence: 0 };
    const cleanedText = cleanOcrText(best.text);
    const meaningful = isMeaningfulOcrText(cleanedText, best.confidence);
    return {
      reasons: meaningful ? sensitivityReasons(cleanedText) : [],
      text: meaningful ? cleanedText : "",
      confidence: meaningful ? Math.round(best.confidence) : 0,
    };
  });
  ocrQueue = job.catch(() => ({ reasons: [], text: "", confidence: 0 }));
  return job;
}

async function extractTextForImages(images) {
  if (!window.Tesseract?.createWorker) throw new Error("Local OCR is unavailable. Check your internet connection and reload the page.");
  const pending = images.filter((image) => !image.ocrProcessed);
  let complete = images.length - pending.length;
  updateProcessingProgress({ phase: "Extracting local text", completed: complete, total: images.length });
  if (pending.length === 0) {
    showMessage(`Local text is already prepared: ${images.length}/${images.length} complete.`);
    updateProcessingProgress({ phase: "Text extraction complete", completed: images.length, total: images.length });
    return;
  }
  for (const image of pending) {
    updateProcessingProgress({ phase: "Extracting local text", completed: complete, total: images.length });
    if (!image.ocrText) {
      const result = await runLocalOcr(image);
      image.ocrText = result.text;
      image.ocrConfidence = result.confidence;
      image.textExtracted = result.text.length >= 10;
      image.sensitiveReasons = [...new Set([...(image.sensitiveReasons || []), ...result.reasons])];
      image.sensitive = image.sensitive || image.sensitiveReasons.length > 0;
    }
    image.ocrProcessed = true;
    await persistLocalInformation(image).catch((error) => {
      console.warn("Could not persist extracted image information", error);
    });
    complete += 1;
    updateProcessingProgress({ phase: "Extracting local text", completed: complete, total: images.length });
    showMessage(`Extracting local text: ${complete}/${images.length} complete…`);
    render();
  }
  updateProcessingProgress({ phase: "Text extraction complete", completed: images.length, total: images.length });
}

function shouldRunOcr(image, predictions) {
  const name = image.name.toLocaleLowerCase();
  if (/receipt|invoice|bill|bank|statement|account|address|screenshot|screen|document|passport|license|card|tax/.test(name)) return true;
  return predictions.some((prediction) => /text|receipt|invoice|paper|document|screen|webpage|website|menu|book|poster|letter/.test(prediction.className.toLocaleLowerCase()));
}

async function persistScanMetadata(images) {
  if (!supabaseClient || !state.user || !state.metadataConsent) return null;

  const scanId = crypto.randomUUID();
  const userId = state.user.id;
  const { error: scanError } = await supabaseClient
    .from("scans")
    .insert({ id: scanId, user_id: userId });
  if (scanError) throw scanError;

  try {
    for (let offset = 0; offset < images.length; offset += 25) {
      const batch = await Promise.all(images.slice(offset, offset + 25).map(async (image) => {
        const bitmap = await createImageBitmap(image.file);
        const width = bitmap.width;
        const height = bitmap.height;
        bitmap.close();
        return {
          id: image.id,
          scan_id: scanId,
          user_id: userId,
          width,
          height,
          is_png: /\.png$/i.test(image.name),
          name_hint: /screenshot|screen[-_ ]?shot|capture/i.test(image.name),
          status: "done",
          category: image.category,
          textract_used: false,
        };
      }));
      const { error } = await supabaseClient.from("images").insert(batch);
      if (error) throw error;
    }
  } catch (error) {
    const { error: cleanupError } = await supabaseClient.from("scans").delete().eq("id", scanId);
    if (cleanupError) {
      throw new Error(`${formatError(error)} Also failed to remove the incomplete scan: ${formatError(cleanupError)}`);
    }
    throw error;
  }

  return { scanId, userId };
}

async function apiRequest(path, options = {}) {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Your session expired. Sign in again before using AWS AI.");

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The SEMACARE API returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(payload?.message || `The SEMACARE API returned HTTP ${response.status}.`);
  }
  return payload;
}

async function makeThumbnail(image) {
  const bitmap = await createImageBitmap(image.file);
  const width = bitmap.width;
  const height = bitmap.height;
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This browser cannot prepare a temporary image thumbnail.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error(`Could not create a thumbnail for ${image.name}.`));
    }, "image/jpeg", 0.82);
  });
  return {
    blob,
    metadata: {
      image_id: image.id,
      width,
      height,
      is_png: /\.png$/i.test(image.name),
      name_hint: /screenshot|screen[-_ ]?shot|capture/i.test(image.name),
    },
  };
}

async function uploadAwsBatch(scanId, images) {
  const prepared = await Promise.all(images.map(makeThumbnail));
  const { uploads } = await apiRequest("/upload-urls", {
    method: "POST",
    body: JSON.stringify({
      scan_id: scanId,
      files: prepared.map((item) => item.metadata),
    }),
  });
  if (!Array.isArray(uploads) || uploads.length !== prepared.length) {
    throw new Error("The upload service returned an incomplete set of upload URLs.");
  }

  const preparedById = new Map(prepared.map((item) => [item.metadata.image_id, item]));
  let nextUpload = 0;
  const uploadWorker = async () => {
    while (nextUpload < uploads.length) {
      const upload = uploads[nextUpload];
      nextUpload += 1;
      const item = preparedById.get(upload.image_id);
      if (!item || typeof upload.url !== "string") {
        throw new Error("The upload service returned an invalid upload entry.");
      }
      const response = await fetch(upload.url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: item.blob,
      });
      if (!response.ok) {
        throw new Error(`A temporary image upload failed (HTTP ${response.status}).`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, uploads.length) }, uploadWorker));
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function processImagesWithAws(images) {
  if (!apiBaseUrl || !state.user || !state.metadataConsent || !state.aiUploadConsent) {
    throw new Error("Sign in and enable both metadata and AWS image-upload consent first.");
  }
  const scanId = crypto.randomUUID();
  state.currentScanId = scanId;
  state.currentScanOwner = state.user.id;
  for (let offset = 0; offset < images.length; offset += 50) {
    const batch = images.slice(offset, offset + 50);
    showMessage(`Preparing temporary thumbnails and uploading batch ${Math.floor(offset / 50) + 1}…`);
    await uploadAwsBatch(scanId, batch);
  }

  let results;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    results = await apiRequest(`/results?scan_id=${encodeURIComponent(scanId)}`);
    if (!Array.isArray(results.images)) {
      throw new Error("The results service returned an invalid image list.");
    }
    const byId = new Map(results.images.map((item) => [item.image_id, item]));
    for (const image of images) {
      const result = byId.get(image.id);
      if (result?.status === "done") {
        image.category = result.category || "Other";
        image.classificationSource = "aws_ai";
        image.aiLabels = result.labels || [];
        image.aiConfidence = result.confidence;
      } else if (result?.status === "error") {
        image.classificationSource = "aws_ai_error";
      }
    }
    render();
    const pending = results.counts?.pending ?? 0;
    showMessage(`AWS AI processing: ${images.length - pending}/${images.length} complete…`);
    if (pending === 0) break;
    if (attempt === 59) {
      throw new Error("AI processing is still pending. Keep this page open and try the scan again later.");
    }
    await delay(2000);
  }

  const errors = results.counts?.error ?? 0;
  const completed = results.counts?.done ?? 0;
  showMessage(
    `${state.folderName}: AI classified ${completed} picture(s); ${errors} failed. Temporary thumbnails are deleted after processing.`,
    errors > 0,
  );
  showToast(`AI classification finished: ${completed} complete, ${errors} failed.`);
}

async function addImages(fileEntries, folderName, rootHandle = null) {
  const entries = [...fileEntries].map((entry) => entry?.file
    ? entry
    : { file: entry, path: entry.webkitRelativePath || entry.name, handle: null, parentHandle: null });
  const supportedEntries = entries.filter((entry) => getImageFiles([entry.file]).length === 1);
  const skippedCount = entries.length - supportedEntries.length;
  const limitedEntries = supportedEntries.slice(0, MAX_IMAGES);

  for (const image of state.images) {
    URL.revokeObjectURL(image.previewUrl);
  }
  state.rootHandle = rootHandle;
  state.images = limitedEntries.map((entry) => ({
    id: crypto.randomUUID(),
    file: entry.file,
    handle: entry.handle,
    parentHandle: entry.parentHandle,
    name: entry.file.name,
    path: entry.path || entry.file.name,
    category: getImageCategory(entry.file.name),
    classificationSource: "filename_guess",
    quality: null,
    textExtracted: false,
    sensitive: false,
    sensitiveReasons: [],
    previewUrl: URL.createObjectURL(entry.file),
    selected: false,
    binned: false,
    ocrProcessed: false,
  }));
  state.folderName = folderName || "Selected pictures";
  state.exported = false;
  state.processing = { active: false, total: 0, completed: 0, startedAt: 0 };
  elements.processingStatus.hidden = true;
  state.currentScanId = null;
  state.currentScanOwner = null;
  updateAuthView(state.user);
  state.activeCategory = "All";
  state.activeView = "categories";
  elements.results.hidden = false;
  updateView();
  render();
  void persistLocalInformationRecords(state.images).catch((error) => {
    console.warn("Could not create the local information index", error);
  });

  if (limitedEntries.length === 0) {
    showMessage("No JPG, PNG, or WebP pictures found. Choose another folder or select picture files.", true);
  } else {
    const skippedMessage = skippedCount > 0 ? ` ${skippedCount} other file(s) skipped.` : "";
    const limitMessage = supportedEntries.length > MAX_IMAGES
      ? ` Showing the first ${MAX_IMAGES} pictures only.`
      : "";
    showMessage(`${state.folderName}: ${limitedEntries.length} picture(s) ready.${skippedMessage}${limitMessage}`);
    showToast("Pictures are ready. Loading local visual classification…");
    const localAiAvailable = state.localAiConsent && await classifyImagesLocally(state.images);
    if (localAiAvailable) {
      showMessage(state.user && apiBaseUrl && !state.aiUploadConsent
        ? `${state.folderName}: local classification complete. AWS upload is off until you enable “Use AWS image AI” in Account.`
        : `${state.folderName}: local visual classification complete. Images stayed in this browser.`);
    } else if (state.localAiConsent) {
      showMessage(`${state.folderName}: local AI was unavailable, so filename suggestions are shown.`, true);
    }
    if (state.user && supabaseClient && state.metadataConsent && state.aiUploadConsent && apiBaseUrl) {
      try {
        await processImagesWithAws(state.images);
      } catch (error) {
        showMessage(`AWS AI unavailable: ${formatError(error)}. Local AI results remain available.`, false);
        showToast("AWS was unavailable; local AI categories are being used.");
      }
    } else if (state.user && supabaseClient && state.metadataConsent) {
      showMessage(`${state.folderName}: saving category metadata to your Supabase account…`);
      try {
        const savedScan = await persistScanMetadata(state.images);
        if (savedScan) {
          state.currentScanId = savedScan.scanId;
          state.currentScanOwner = savedScan.userId;
          updateAuthView(state.user);
          showMessage(`${state.folderName}: ${limitedEntries.length} picture(s) ready. Category metadata saved to Supabase; images and filenames stayed on this device.`);
        }
      } catch (error) {
        showMessage(`Pictures are ready locally, but Supabase could not save their metadata: ${formatError(error)}`, true);
      }
    }
  }
}

async function collectFolderImages(rootHandle) {
  const entries = [];
  const pending = [{ handle: rootHandle, path: "" }];

  while (pending.length > 0 && entries.length <= MAX_IMAGES) {
    const current = pending.pop();
    const directory = current.handle;
    for await (const [name, handle] of directory.entries()) {
      if (name.startsWith(".")) continue;
      if (handle.kind === "directory") {
        pending.push({ handle, path: current.path ? `${current.path}/${name}` : name });
      } else if (/\.(jpe?g|png|webp)$/i.test(name)) {
        entries.push({
          file: await handle.getFile(),
          handle,
          parentHandle: directory,
          path: current.path ? `${current.path}/${name}` : name,
        });
        if (entries.length > MAX_IMAGES) break;
      }
    }
  }
  return entries;
}

function chooseFolder() {
  // Use the native directory input for the primary action. It is supported by
  // the local app's browser targets and returns the files without cloud upload
  // or File System Access permission prompts.
  showMessage("Choose a folder containing JPG, PNG, or WebP pictures…");
  elements.folderInput.click();
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderCategoryCards() {
  elements.categoryGrid.replaceChildren();
  const visibleImages = state.images.filter((image) => !image.binned);
  const cards = [{ name: "All", icon: "🖼️" }, ...CATEGORIES, { name: SENSITIVE_FILTER, icon: "🔒" }];

  for (const category of cards) {
    const count = category.name === "All"
      ? visibleImages.length
      : category.name === SENSITIVE_FILTER
        ? visibleImages.filter((image) => image.sensitive).length
        : visibleImages.filter((image) => image.category === category.name).length;
    const button = createElement("button", "category-card");
    button.type = "button";
    button.classList.toggle("is-active", state.activeCategory === category.name);
    button.setAttribute("aria-pressed", String(state.activeCategory === category.name));
    button.append(
      createElement("span", "category-name", `${category.icon} ${category.name}`),
      createElement("span", "category-count", `${count} ${count === 1 ? "picture" : "pictures"}`),
    );
    button.addEventListener("click", () => {
      state.activeCategory = category.name;
      render();
    });
    elements.categoryGrid.append(button);
  }
}

function createImageCard(image, inBin = false) {
  const card = createElement("article", "image-card");
  const preview = createElement("img", "image-preview");
  preview.src = image.previewUrl;
  preview.alt = `Preview of ${image.name}`;
  preview.loading = "lazy";

  const info = createElement("div", "image-info");
  const topline = createElement("div", "image-topline");
  const name = createElement("p", "image-name", image.name);
  name.title = image.name;
  topline.append(name);

  if (!inBin) {
    const checkbox = createElement("input", "image-select");
    checkbox.type = "checkbox";
    checkbox.checked = image.selected;
    checkbox.setAttribute("aria-label", `Select ${image.name} for the local bin`);
    checkbox.addEventListener("change", () => {
      image.selected = checkbox.checked;
      renderToolbar();
    });
    topline.append(checkbox);
  }

  const category = CATEGORIES.find((item) => item.name === image.category);
  info.append(topline);
  if (!inBin) {
    const categoryLabel = createElement("label", "category-control");
    categoryLabel.append(createElement("span", "category-control-label", "Review category"));
    const categorySelect = createElement("select", "category-select");
    categorySelect.setAttribute("aria-label", `Category for ${image.name}`);
    for (const optionCategory of CATEGORIES) {
      const option = createElement("option", "", optionCategory.name);
      option.value = optionCategory.name;
      option.selected = optionCategory.name === image.category;
      categorySelect.append(option);
    }
      categorySelect.addEventListener("change", () => {
        const previousCategory = image.category;
        const previousSource = image.classificationSource;
        image.category = categorySelect.value;
        image.classificationSource = "manual";
      render();
      void persistLocalInformation(image).catch((error) => console.warn("Could not persist the category change", error));
      void persistImageCategory(image).then((saved) => {
        showToast(saved
          ? "Category updated manually and saved to Supabase; this is not AI classification."
          : "Category updated manually in this browser; this is not AI classification.");
      }).catch((error) => {
        image.category = previousCategory;
        image.classificationSource = previousSource;
        render();
        showToast(`Could not save the category to Supabase: ${formatError(error)}`);
      });
    });
    categoryLabel.append(categorySelect);
    info.append(categoryLabel);
    const sensitiveLabel = createElement("label", "sensitive-toggle");
    const sensitiveCheckbox = createElement("input");
    sensitiveCheckbox.type = "checkbox";
    sensitiveCheckbox.checked = image.sensitive;
    sensitiveCheckbox.setAttribute("aria-label", `Mark ${image.name} as sensitive`);
    sensitiveCheckbox.addEventListener("change", () => {
      image.sensitive = sensitiveCheckbox.checked;
      image.sensitiveReasons = image.sensitive ? (image.sensitiveReasons?.length ? image.sensitiveReasons : ["Marked sensitive manually"]) : [];
      image.classificationSource = "manual";
      render();
      void persistLocalInformation(image).catch((error) => console.warn("Could not persist the sensitivity change", error));
      showToast(image.sensitive ? "Sensitive warning added." : "Sensitive warning removed.");
    });
    sensitiveLabel.append(sensitiveCheckbox, createElement("span", "category-control-label", "Mark as sensitive"));
    info.append(sensitiveLabel);
  } else {
    info.append(createElement("span", "image-category", `${category.icon} ${image.category} · local bin`));
  }
  if (image.sensitive) {
    const reasons = image.sensitiveReasons?.join(", ") || "Sensitive details detected";
    const sensitiveBadge = createElement("span", "sensitive-badge", `🔒 Sensitive · ${reasons}`);
    sensitiveBadge.title = reasons;
    info.append(sensitiveBadge);
  }
  if (image.textExtracted) {
    info.append(createElement("span", "text-extracted-badge", "✎ Text extracted · review before deleting"));
  }
  const sourceNote = image.classificationSource === "manual"
    ? "Manually chosen"
    : image.classificationSource === "aws_ai"
      ? `AWS AI result${image.aiConfidence == null ? "" : ` · ${Math.round(image.aiConfidence)}% confidence`}`
      : image.classificationSource === "local_ai"
        ? `Local AI result${image.aiConfidence == null ? "" : ` · ${Math.round(image.aiConfidence)}% confidence`}`
      : image.classificationSource === "local_quality_check"
        ? `Quality check · ${image.quality?.reason || "low-information image"}`
      : image.classificationSource === "aws_ai_error"
        ? "AWS unavailable · local result shown"
        : "Filename-based guess";
  info.append(createElement("p", "image-path classification-note", sourceNote));
  if (image.aiLabels?.length) {
    const faceNote = image.faceCount > 0 ? ` · ${image.faceCount} face${image.faceCount === 1 ? "" : "s"} detected` : "";
    info.append(createElement("p", "image-path", `AI labels: ${image.aiLabels.join(", ")}${faceNote}`));
  }
  if (image.ocrText) {
    const extracted = createElement("p", "extracted-text", `Text: ${image.ocrText.slice(0, 180)}${image.ocrText.length > 180 ? "…" : ""}`);
    extracted.title = image.ocrText;
    info.append(extracted);
  }
  const path = createElement("p", "image-path", image.path);
  path.title = image.path;
  info.append(path);

  if (inBin) {
    const binnedAt = image.binnedAt || Date.now();
    const remainingHours = Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - binnedAt)) / (60 * 60 * 1000)));
    info.append(createElement("p", "image-path", remainingHours > 0 ? `Expires in ${remainingHours} hour(s)` : "Review window expired"));
    const restore = createElement("button", "button restore-button", "Restore to categories");
    restore.type = "button";
    restore.addEventListener("click", () => {
      image.binned = false;
      render();
      showToast("Restored to categories. The original file was not deleted.");
    });
    info.append(restore);
  }

  card.append(preview, info);
  return card;
}

async function persistImageCategory(image) {
  if (!supabaseClient || !state.user || !state.metadataConsent
    || state.currentScanOwner !== state.user.id || !state.currentScanId) {
    return false;
  }
  const { error } = await supabaseClient
    .from("images")
    .update({ category: image.category, status: "done" })
    .eq("id", image.id)
    .eq("scan_id", state.currentScanId);
  if (error) throw error;
  return true;
}

async function deleteCloudImageRows(imageIds) {
  if (!supabaseClient || !state.user || state.currentScanOwner !== state.user.id || !state.currentScanId) {
    return;
  }
  const { error } = await supabaseClient
    .from("images")
    .delete()
    .in("id", imageIds)
    .eq("scan_id", state.currentScanId);
  if (error) throw error;
}

async function eraseAllSavedMetadata() {
  if (!supabaseClient || !state.user) return;
  const confirmed = window.confirm("Erase all your saved scans and category metadata from Supabase? Original pictures on this device will not be deleted.");
  if (!confirmed) return;
  try {
    const { data, error } = await supabaseClient
      .from("scans")
      .delete()
      .eq("user_id", state.user.id)
      .select("id");
    if (error) throw error;
    state.currentScanId = null;
    state.currentScanOwner = null;
    updateAuthView(state.user);
    showToast(`Erased ${data.length} saved scan(s) and their metadata. Local pictures were not changed.`);
  } catch (error) {
    showToast(`Could not erase saved metadata: ${formatError(error)}`);
  }
}

function renderToolbar() {
  const selectedCount = state.images.filter((image) => image.selected && !image.binned).length;
  elements.selectionCount.textContent = `${selectedCount} selected`;
  elements.moveToBin.disabled = selectedCount === 0;
}

function renderImageGrid() {
  elements.imageGrid.replaceChildren();
  const visibleImages = state.images.filter((image) => {
    const matchesCategory = state.activeCategory === "All"
      || (state.activeCategory === SENSITIVE_FILTER ? image.sensitive : image.category === state.activeCategory);
    return !image.binned && matchesCategory;
  });

  if (visibleImages.length === 0) {
    const message = state.images.some((image) => !image.binned)
      ? "No pictures in this category. Choose another category to see your pictures."
      : "All pictures are in the local bin. Restore one or choose another folder.";
    elements.imageGrid.append(createElement("p", "empty-state", message));
    return;
  }
  for (const image of visibleImages) elements.imageGrid.append(createImageCard(image));
}

function renderBin() {
  const binnedImages = state.images.filter((image) => image.binned);
  elements.binCount.textContent = String(binnedImages.length);
  elements.emptyBin.disabled = binnedImages.length === 0;
  elements.binGrid.replaceChildren();

  if (binnedImages.length === 0) {
    elements.binGrid.append(createElement("p", "empty-state", "The local bin is empty."));
    return;
  }
  for (const image of binnedImages) elements.binGrid.append(createImageCard(image, true));
}

function render() {
  renderJourney();
  renderCategoryCards();
  renderImageGrid();
  renderBin();
  renderToolbar();
  if (state.activeView === "archive") void renderInformationArchive();
}

function updateView() {
  const showingBin = state.activeView === "bin";
  const showingArchive = state.activeView === "archive";
  elements.categoriesView.hidden = showingBin || showingArchive;
  elements.binView.hidden = !showingBin;
  elements.archiveView.hidden = !showingArchive;
  elements.viewCategories.classList.toggle("is-active", !showingBin && !showingArchive);
  elements.viewBin.classList.toggle("is-active", showingBin);
  elements.viewArchive.classList.toggle("is-active", showingArchive);
  elements.viewCategories.setAttribute("aria-pressed", String(!showingBin && !showingArchive));
  elements.viewBin.setAttribute("aria-pressed", String(showingBin));
  elements.viewArchive.setAttribute("aria-pressed", String(showingArchive));
}

elements.chooseFolder.addEventListener("click", chooseFolder);
elements.startStep.addEventListener("click", chooseFolder);
elements.chooseFiles.addEventListener("click", () => elements.filesInput.click());
elements.accountToggle.addEventListener("click", () => {
  elements.accountPanel.hidden = false;
  elements.accountToggle.setAttribute("aria-expanded", "true");
  elements.accountClose.focus();
});
elements.accountClose.addEventListener("click", () => {
  elements.accountPanel.hidden = true;
  elements.accountToggle.setAttribute("aria-expanded", "false");
  elements.accountToggle.focus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.accountPanel.hidden) {
    elements.accountClose.click();
  }
});
elements.authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void authenticate("signin");
});
elements.signUp.addEventListener("click", () => {
  void authenticate("signup");
});
elements.signOut.addEventListener("click", async () => {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (error) {
    setAuthStatus(`Could not sign out: ${formatError(error)}`, true);
  }
});
elements.metadataConsent.addEventListener("change", () => {
  state.metadataConsent = elements.metadataConsent.checked;
  if (state.user) {
    updateAuthView(state.user);
    if (!state.metadataConsent && state.currentScanId) {
      setAuthStatus(`Signed in as ${state.user.email}. Future metadata sync is off; erase saved scan metadata below to remove this scan.`);
    }
  }
});
elements.aiUploadConsent.addEventListener("change", () => {
  state.aiUploadConsent = elements.aiUploadConsent.checked;
  if (state.aiUploadConsent && (!state.user || !state.metadataConsent || !apiBaseUrl)) {
    state.aiUploadConsent = false;
    elements.aiUploadConsent.checked = false;
    showToast("Sign in, enable metadata consent, and configure the AWS API before opting in.");
    return;
  }
  if (state.aiUploadConsent) {
    showToast("AWS AI consent enabled. No images are sent until you choose them.");
  }
});
elements.localAiConsent.addEventListener("change", () => {
  state.localAiConsent = elements.localAiConsent.checked;
  showToast(state.localAiConsent
    ? "Local AI enabled. Pictures stay in this browser."
    : "Local AI disabled. Filename suggestions will be used.");
});
elements.eraseCloudScan.addEventListener("click", () => {
  void eraseAllSavedMetadata();
});
elements.folderInput.addEventListener("change", () => {
  if (elements.folderInput.files?.length) {
    const firstPath = elements.folderInput.files[0].webkitRelativePath;
    void addImages(elements.folderInput.files, firstPath.split("/")[0]).catch((error) => {
      showMessage(`Could not prepare those pictures: ${formatError(error)}`, true);
    });
  }
  elements.folderInput.value = "";
});
elements.folderInput.addEventListener("cancel", () => {
  showMessage("Folder selection cancelled. Your files have not been changed.");
});
elements.filesInput.addEventListener("change", () => {
  if (elements.filesInput.files?.length) {
    void addImages(elements.filesInput.files, "Selected pictures").catch((error) => {
      showMessage(`Could not prepare those pictures: ${formatError(error)}`, true);
    });
  }
  elements.filesInput.value = "";
});
elements.filesInput.addEventListener("cancel", () => {
  showMessage("Picture selection cancelled. Your files have not been changed.");
});

elements.viewCategories.addEventListener("click", () => {
  state.activeView = "categories";
  updateView();
});
elements.viewBin.addEventListener("click", () => {
  state.activeView = "bin";
  updateView();
  renderBin();
});
elements.viewArchive.addEventListener("click", () => {
  state.activeView = "archive";
  updateView();
  void renderInformationArchive();
});
elements.viewInformation.addEventListener("click", () => {
  state.activeView = "archive";
  updateView();
  void renderInformationArchive();
  elements.archiveSearch.focus();
});
elements.archiveSearch.addEventListener("input", () => {
  void renderInformationArchive();
});
elements.clearArchive.addEventListener("click", async () => {
  if (!window.confirm("Clear all saved extracted information from this browser? Original image files will not be changed.")) return;
  try {
    await clearLocalInformationRecords();
    await renderInformationArchive();
    showToast("Local information archive cleared. Original pictures were not changed.");
  } catch (error) {
    showToast(`Could not clear the local archive: ${formatError(error)}`);
  }
});
elements.selectVisible.addEventListener("click", () => {
  for (const image of state.images) {
    const matches = state.activeCategory === "All"
      || (state.activeCategory === SENSITIVE_FILTER ? image.sensitive : image.category === state.activeCategory);
    if (!image.binned && matches) {
      image.selected = true;
    }
  }
  render();
});
elements.clearSelection.addEventListener("click", () => {
  for (const image of state.images) image.selected = false;
  render();
});
elements.exportCsv.addEventListener("click", () => {
  const rows = [
    ["filename", "rel_path", "category", "classification_source", "sensitive", "text_extracted", "quality_reason", "sensitive_reasons", "status", "size_bytes"],
    ...state.images.map((image) => [
      image.name,
      image.path,
      image.category,
      image.classificationSource,
      image.sensitive ? "yes" : "no",
      image.textExtracted ? "yes" : "no",
      image.quality?.reason || "",
      (image.sensitiveReasons || []).join("; "),
      image.binned ? "local_bin" : "in_review",
      String(image.file.size),
    ]),
  ];
  downloadCsv(rows, "semacare-results.csv");
  showToast("CSV exported with local AI categories and sensitive-content flags.");
});
async function exportOrganisedImages() {
  const images = state.images.filter((image) => !image.binned);
  if (images.length === 0) throw new Error("There are no remaining images to export.");
  if (typeof window.showDirectoryPicker !== "function") {
    throw new Error("Exporting renamed files requires Chrome or Edge with folder access enabled.");
  }
  const destination = await window.showDirectoryPicker({ mode: "readwrite", id: "semacare-export" });
  const counts = new Map();
  for (const image of images) {
    const category = image.category || "Other";
    const count = (counts.get(category) || 0) + 1;
    counts.set(category, count);
    const categoryFolder = await destination.getDirectoryHandle(category, { create: true });
    const extension = image.name.match(/\.[^.]+$/)?.[0] || ".jpg";
    const exportName = `${category.replace(/[^a-z0-9]+/gi, "-")}_${String(count).padStart(3, "0")}${extension}`;
    const output = await categoryFolder.getFileHandle(exportName, { create: true });
    const writable = await output.createWritable();
    await writable.write(image.file);
    await writable.close();
    image.exportName = `${category}/${exportName}`;
  }
  await persistLocalInformationRecords(images).catch((error) => {
    console.warn("Could not persist export names", error);
  });
  state.exported = true;
  render();
  showToast(`Exported ${images.length} remaining image(s) into category folders with their original formats preserved.`);
}
elements.exportImages.addEventListener("click", async () => {
  try {
    await exportOrganisedImages();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    showToast(`Could not export renamed images: ${formatError(error)}`);
  }
});
elements.exportInfoCsv.addEventListener("click", async () => {
  const images = state.images.filter((image) => !image.binned);
  if (images.length === 0) {
    showToast("Choose pictures before exporting extracted information.");
    return;
  }
  try {
    await extractTextForImages(images);
    const confirmed = window.confirm("The information CSV may contain text from sensitive images. Export it to this device?");
    if (!confirmed) return;
    const rows = [[
      "filename", "category", "sensitive", "sensitive_reasons",
      "meaningful_fields", "ocr_confidence", "extracted_information",
    ]];
    for (const image of images) {
      rows.push([
        image.name,
        image.category,
        image.sensitive ? "yes" : "no",
        (image.sensitiveReasons || []).join("; "),
        meaningfulFields(image.ocrText).join("; "),
        String(image.ocrConfidence ?? ""),
        textSegments(image.ocrText).join("\n"),
      ]);
    }
    downloadCsv(rows, "semacare-structured-information.csv");
    showToast("Information CSV exported locally: one row per image with organised text in the final column.");
  } catch (error) {
    showMessage(`Could not extract text: ${formatError(error)}`, true);
  }
});
elements.exportInfoJson.addEventListener("click", async () => {
  const images = state.images.filter((image) => !image.binned);
  if (images.length === 0) {
    showToast("Choose pictures before exporting extracted information.");
    return;
  }
  try {
    await extractTextForImages(images);
    const confirmed = window.confirm("The information JSON may contain text from sensitive images. Export it to this device?");
    if (!confirmed) return;
    await persistLocalInformationRecords(images);
    downloadJson({
      format: "semacare-information",
      version: 1,
      exported_at: new Date().toISOString(),
      records: images.map(informationRecord),
    }, "semacare-information.json");
    showToast("Structured information JSON exported locally.");
  } catch (error) {
    showMessage(`Could not export structured information: ${formatError(error)}`, true);
  }
});
elements.moveToBin.addEventListener("click", () => {
  const selectedImages = state.images.filter((image) => image.selected && !image.binned);
  if (selectedImages.length === 0) return;
  for (const image of selectedImages) {
    image.binned = true;
    image.binnedAt = Date.now();
    image.selected = false;
  }
  void persistLocalInformationRecords(selectedImages).catch((error) => {
    console.warn("Could not persist recycle-bin status", error);
  });
  render();
  showToast(`${selectedImages.length} picture(s) moved to the recycle bin. Nothing is deleted yet.`);
});
elements.emptyBin.addEventListener("click", async () => {
  const binnedImages = state.images.filter((image) => image.binned);
  if (binnedImages.length === 0) return;
  const confirmed = window.confirm(
    `Permanently delete ${binnedImages.length} item(s) from the selected folder? This cannot be undone.`,
  );
  if (!confirmed) return;
  const removedIds = new Set(binnedImages.map((image) => image.id));
  const deletable = binnedImages.filter((image) => image.parentHandle?.removeEntry);
  const notDeletable = binnedImages.length - deletable.length;
  try {
    if (deletable.length > 0 && state.rootHandle?.queryPermission) {
      const permission = await state.rootHandle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        const requested = await state.rootHandle.requestPermission({ mode: "readwrite" });
        if (requested !== "granted") throw new Error("Folder write permission was not granted.");
      }
    }
    for (const image of deletable) await image.parentHandle.removeEntry(image.name);
    await deleteCloudImageRows([...removedIds]);
  } catch (error) {
    showToast(`Nothing was permanently deleted: ${formatError(error)}`);
    return;
  }
  for (const image of binnedImages) URL.revokeObjectURL(image.previewUrl);
  for (const image of binnedImages) image.permanentlyDeleted = true;
  await persistLocalInformationRecords(binnedImages).catch((error) => {
    console.warn("Could not preserve information for deleted images", error);
  });
  state.images = state.images.filter((image) => !removedIds.has(image.id));
  render();
  showToast(notDeletable
    ? `Deleted ${deletable.length} file(s). ${notDeletable} file(s) were kept because they were selected without folder write access.`
    : "Recycle bin emptied. Selected files were permanently deleted.");
});

void initializeAuth();

window.addEventListener("beforeunload", () => {
  for (const image of state.images) URL.revokeObjectURL(image.previewUrl);
});
