const CATEGORIES = [
  { name: "Receipts", icon: "🧾", words: ["receipt", "invoice", "bill", "tax", "payment"] },
  { name: "Screenshots", icon: "📱", words: ["screenshot", "screen-shot", "screen_shot", "screen shot", "capture"] },
  { name: "Landscapes", icon: "🏞️", words: ["landscape", "mountain", "beach", "sunset", "nature", "sea"] },
  { name: "People", icon: "🧑", words: ["person", "people", "portrait", "family", "friend", "selfie"] },
  { name: "Memes", icon: "😂", words: ["meme", "funny", "lol"] },
  { name: "Other", icon: "📁", words: [] },
];
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
  chooseFiles: document.querySelector("#choose-files"),
  folderInput: document.querySelector("#folder-input"),
  filesInput: document.querySelector("#files-input"),
  folderSummary: document.querySelector("#folder-summary"),
  results: document.querySelector("#results"),
  categoryGrid: document.querySelector("#category-grid"),
  imageGrid: document.querySelector("#image-grid"),
  binGrid: document.querySelector("#bin-grid"),
  categoriesView: document.querySelector("#categories-view"),
  binView: document.querySelector("#bin-view"),
  viewCategories: document.querySelector("#view-categories"),
  viewBin: document.querySelector("#view-bin"),
  binCount: document.querySelector("#bin-count"),
  selectionCount: document.querySelector("#selection-count"),
  selectVisible: document.querySelector("#select-visible"),
  clearSelection: document.querySelector("#clear-selection"),
  exportCsv: document.querySelector("#export-csv"),
  moveToBin: document.querySelector("#move-to-bin"),
  emptyBin: document.querySelector("#empty-bin"),
  toast: document.querySelector("#toast"),
};

const config = window.SEMACARE_CONFIG;
const supabaseLibrary = window.supabase;
let supabaseClient = null;
let supabaseInitError = null;
let apiBaseUrl = "";
let apiInitError = null;
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
  elements.aiUploadConsent.disabled = !signedIn || !supabaseClient || !apiBaseUrl;
  elements.signIn.hidden = signedIn;
  elements.signUp.hidden = signedIn;
  elements.signOut.hidden = !signedIn;
  elements.eraseCloudScan.hidden = !signedIn;
  if (signedIn) {
    const aiStatus = apiInitError
      ? ` AI service URL is invalid: ${apiInitError}`
      : !apiBaseUrl
        ? " AWS AI is not connected yet; local filename suggestions remain available."
        : " AWS AI is available after you give upload consent.";
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

async function addImages(files, folderName) {
  const supportedFiles = getImageFiles(files);
  const skippedCount = files.length - supportedFiles.length;
  const limitedFiles = supportedFiles.slice(0, MAX_IMAGES);

  for (const image of state.images) {
    URL.revokeObjectURL(image.previewUrl);
  }
  state.images = limitedFiles.map((file) => ({
    id: crypto.randomUUID(),
    file,
    name: file.name,
    path: file.webkitRelativePath || file.name,
    category: getImageCategory(file.name),
    classificationSource: "filename_guess",
    previewUrl: URL.createObjectURL(file),
    selected: false,
    binned: false,
  }));
  state.folderName = folderName || "Selected pictures";
  state.currentScanId = null;
  state.currentScanOwner = null;
  updateAuthView(state.user);
  state.activeCategory = "All";
  state.activeView = "categories";
  elements.results.hidden = false;
  updateView();
  render();

  if (limitedFiles.length === 0) {
    showMessage("No JPG, PNG, or WebP pictures found. Choose another folder or select picture files.", true);
  } else {
    const skippedMessage = skippedCount > 0 ? ` ${skippedCount} other file(s) skipped.` : "";
    const limitMessage = supportedFiles.length > MAX_IMAGES
      ? ` Showing the first ${MAX_IMAGES} pictures only.`
      : "";
    showMessage(`${state.folderName}: ${limitedFiles.length} picture(s) ready.${skippedMessage}${limitMessage}`);
    showToast("Pictures are ready. Category suggestions are filename-based, not AI results.");
    if (state.user && supabaseClient && state.metadataConsent && state.aiUploadConsent && apiBaseUrl) {
      try {
        await processImagesWithAws(state.images);
      } catch (error) {
        showMessage(`AWS AI processing did not complete: ${formatError(error)}. Images remain in this browser.`, true);
      }
    } else if (state.user && supabaseClient && state.metadataConsent) {
      showMessage(`${state.folderName}: saving category metadata to your Supabase account…`);
      try {
        const savedScan = await persistScanMetadata(state.images);
        if (savedScan) {
          state.currentScanId = savedScan.scanId;
          state.currentScanOwner = savedScan.userId;
          updateAuthView(state.user);
          showMessage(`${state.folderName}: ${limitedFiles.length} picture(s) ready. Category metadata saved to Supabase; images and filenames stayed on this device.`);
        }
      } catch (error) {
        showMessage(`Pictures are ready locally, but Supabase could not save their metadata: ${formatError(error)}`, true);
      }
    }
  }
}

async function collectFolderImages(rootHandle) {
  const files = [];
  const pending = [rootHandle];

  while (pending.length > 0 && files.length <= MAX_IMAGES) {
    const directory = pending.pop();
    for await (const [name, handle] of directory.entries()) {
      if (name.startsWith(".")) continue;
      if (handle.kind === "directory") {
        pending.push(handle);
      } else if (/\.(jpe?g|png|webp)$/i.test(name)) {
        files.push(await handle.getFile());
        if (files.length > MAX_IMAGES) break;
      }
    }
  }
  return files;
}

async function chooseFolder() {
  if (typeof window.showDirectoryPicker !== "function") {
    elements.folderInput.click();
    return;
  }

  elements.chooseFolder.disabled = true;
  showMessage("Reading picture names from the selected folder…");
  try {
    const root = await window.showDirectoryPicker({ mode: "read" });
    const files = await collectFolderImages(root);
    await addImages(files, root.name);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      showMessage("Folder selection cancelled. Your files have not been changed.");
      return;
    }
    showMessage(`Could not read that folder: ${error instanceof Error ? error.message : String(error)}`, true);
  } finally {
    elements.chooseFolder.disabled = false;
  }
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
  const cards = [{ name: "All", icon: "🖼️" }, ...CATEGORIES];

  for (const category of cards) {
    const count = category.name === "All"
      ? visibleImages.length
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
  } else {
    info.append(createElement("span", "image-category", `${category.icon} ${image.category} · local bin`));
  }
  const sourceNote = image.classificationSource === "manual"
    ? "Manually chosen"
    : image.classificationSource === "aws_ai"
      ? `AWS AI result${image.aiConfidence == null ? "" : ` · ${Math.round(image.aiConfidence)}% confidence`}`
      : image.classificationSource === "aws_ai_error"
        ? "AI processing failed · review manually"
        : "Filename-based guess";
  info.append(createElement("p", "image-path classification-note", sourceNote));
  if (image.aiLabels?.length) {
    info.append(createElement("p", "image-path", `AI labels: ${image.aiLabels.join(", ")}`));
  }
  const path = createElement("p", "image-path", image.path);
  path.title = image.path;
  info.append(path);

  if (inBin) {
    const restore = createElement("button", "button restore-button", "Restore to categories");
    restore.type = "button";
    restore.addEventListener("click", () => {
      image.binned = false;
      render();
      showToast("Restored to categories. The original file was never moved.");
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
    return !image.binned && (state.activeCategory === "All" || image.category === state.activeCategory);
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
  renderCategoryCards();
  renderImageGrid();
  renderBin();
  renderToolbar();
}

function updateView() {
  const showingBin = state.activeView === "bin";
  elements.categoriesView.hidden = showingBin;
  elements.binView.hidden = !showingBin;
  elements.viewCategories.classList.toggle("is-active", !showingBin);
  elements.viewBin.classList.toggle("is-active", showingBin);
  elements.viewCategories.setAttribute("aria-pressed", String(!showingBin));
  elements.viewBin.setAttribute("aria-pressed", String(showingBin));
}

elements.chooseFolder.addEventListener("click", chooseFolder);
elements.chooseFiles.addEventListener("click", () => elements.filesInput.click());
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
elements.filesInput.addEventListener("change", () => {
  if (elements.filesInput.files?.length) {
    void addImages(elements.filesInput.files, "Selected pictures").catch((error) => {
      showMessage(`Could not prepare those pictures: ${formatError(error)}`, true);
    });
  }
  elements.filesInput.value = "";
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
elements.selectVisible.addEventListener("click", () => {
  for (const image of state.images) {
    if (!image.binned && (state.activeCategory === "All" || image.category === state.activeCategory)) {
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
    ["filename", "rel_path", "category", "classification_source", "status", "size_bytes"],
    ...state.images.map((image) => [
      image.name,
      image.path,
      image.category,
      image.classificationSource,
      image.binned ? "local_bin" : "in_review",
      String(image.file.size),
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
  const downloadUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = "semacare-results.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast("CSV exported. It includes filename guesses or manually chosen categories, not AI results.");
});
elements.moveToBin.addEventListener("click", () => {
  const selectedImages = state.images.filter((image) => image.selected && !image.binned);
  if (selectedImages.length === 0) return;
  for (const image of selectedImages) {
    image.binned = true;
    image.selected = false;
  }
  render();
  showToast(`${selectedImages.length} picture(s) moved to the local bin. Original files are untouched.`);
});
elements.emptyBin.addEventListener("click", async () => {
  const binnedImages = state.images.filter((image) => image.binned);
  if (binnedImages.length === 0) return;
  const confirmed = window.confirm(
    `Remove ${binnedImages.length} item(s) from the local bin? Their saved category metadata will also be removed if this scan was synced. Original files will not be deleted.`,
  );
  if (!confirmed) return;
  const removedIds = new Set(binnedImages.map((image) => image.id));
  try {
    await deleteCloudImageRows([...removedIds]);
  } catch (error) {
    showToast(`Could not remove saved metadata from Supabase: ${formatError(error)}`);
    return;
  }
  for (const image of binnedImages) URL.revokeObjectURL(image.previewUrl);
  state.images = state.images.filter((image) => !removedIds.has(image.id));
  render();
  showToast("Local bin emptied. Original files remain in their folder.");
});

void initializeAuth();

window.addEventListener("beforeunload", () => {
  for (const image of state.images) URL.revokeObjectURL(image.previewUrl);
});
