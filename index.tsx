/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type, GenerateContentResponse, VideoGenerationReferenceImage, VideoGenerationReferenceType } from "@google/genai";

// Fix: Add a declaration for the Cropper.js library which is assumed to be loaded globally. This resolves the "Cannot find name 'Cropper'" errors.
declare var Cropper: any;

// --- TYPE DEFINITIONS ---
enum AppState {
  API_KEY_NEEDED,
  IDLE,
  LOADING_ENHANCE,
  LOADING_GENERATE,
  ERROR,
}

interface UploadedImage {
  id: string;
  originalFile: File;
  croppedBase64: string;
  mimeType: string;
}

interface UploadedVideo {
  file: File;
  base64: string;
}

interface GeneratedVideo {
    url: string;
    blob: Blob;
    prompt: string;
}

// --- CONSTANTS ---
const CREATIVE_PROMPTS = {
    "Drone shot": "نمایی هوایی و متحرک که از بالا به سوژه نگاه می‌کند، انگار که با یک پهپاد فیلم‌برداری شده باشد. این تکنیک برای نمایش مقیاس و عظمت صحنه بسیار مؤثر است.",
    "Timelapse": "فرآیندی که در آن فریم‌ها با سرعت بسیار کمتری نسبت به حالت عادی ضبط شده و با سرعت نرمال پخش می‌شوند. این کار باعث می‌شود گذر زمان (مانند حرکت ابرها یا طلوع خوریشد) بسیار سریع به نظر برسد.",
    "Hyperlapse": "نسخه پیشرفته‌تر تایم‌لپس که در آن دوربین در حین فیلم‌برداری مسافت زیادی را طی می‌کند. این تکنیک حس حرکت سریع و پویا در یک محیط بزرگ را ایجاد می‌کند.",
    "Slow motion": "جلوه‌ای که در آن حرکت سوژه کندتر از حالت عادی نمایش داده می‌شود. این تکنیک برای تأکید بر جزئیات، ایجاد حس دراماتیک یا نمایش زیبایی یک حرکت خاص استفاده می‌شود.",
    "Cinematic": "این دستور به هوش مصنوعی می‌گوید که از تکنیک‌های فیلم‌برداری سینمایی حرفه‌ای استفاده کند، مانند عمق میدان کم (فوکوس روی سوژه و محو کردن پس‌زمینه)، نورپردازی دراماتیک و رنگ‌بندی حرفه‌ای.",
    "Black and white": "تمام رنگ‌ها را از ویدیو حذف کرده و آن را به صورت سیاه و سفید نمایش می‌دهد. این سبک برای ایجاد حس نوستالژی، درام یا تمرکز بر روی فرم و بافت استفاده می‌شود.",
    "First-person view": "نمایی از دید اول شخص که مخاطب احساس می‌کند از چشمان شخصیت اصلی به دنیا نگاه می‌کند. این تکنیک برای غوطه‌ور کردن بیننده در داستان بسیار قدرتمند است.",
    "Dolly zoom": "یک افکت سینمایی معروف که در آن دوربین به سوژه نزدیک یا از آن دور می‌شود در حالی که همزمان زوم لنز در جهت مخالف تغییر می‌کند. این کار باعث ایجاد حس سرگیجه و اضطراب می‌شود.",
};


// --- DOM ELEMENT REFERENCES ---
const getElem = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dom = {
  // Modals
  modalBackdrop: getElem('modal-backdrop'),
  apiKeyModal: getElem('api-key-modal'),
  apiKeyInput: getElem<HTMLInputElement>('api-key-input'),
  saveApiKeyButton: getElem<HTMLButtonElement>('save-api-key-button'),
  helpModal: getElem('help-modal'),
  helpModalTitle: getElem('help-modal-title'),
  helpModalContent: getElem('help-modal-content'),
  helpModalStatus: getElem('help-modal-status'),
  helpModalClose: getElem<HTMLButtonElement>('help-modal-close'),
  guideModal: getElem('guide-modal'),
  guideModalClose: getElem<HTMLButtonElement>('guide-modal-close'),
  openGuideButton: getElem<HTMLButtonElement>('open-guide-button'),
  cropperModal: getElem('cropper-modal'),
  cropperContainer: getElem('cropper-container'),
  cancelCropButton: getElem<HTMLButtonElement>('cancel-crop-button'),
  confirmCropButton: getElem<HTMLButtonElement>('confirm-crop-button'),

  // Main App
  mainApp: getElem('main-app'),
  promptInput: getElem<HTMLTextAreaElement>('prompt-input'),
  copyPromptButton: getElem<HTMLButtonElement>('copy-prompt-button'),
  creativePromptsContainer: getElem('creative-prompts-container'),
  enhancePromptButton: getElem<HTMLButtonElement>('enhance-prompt-button'),
  enhancePromptIcon: getElem('enhance-prompt-icon'),
  videoUploadSlot: getElem('video-upload-slot'),
  imageUploadGrid: getElem('image-upload-grid'),
  generateButton: getElem<HTMLButtonElement>('generate-button'),
  generateButtonIcon: getElem('generate-button-icon'),
  generateButtonText: getElem('generate-button-text'),
  resultsGallery: getElem('results-gallery'),
};

// --- STATE MANAGEMENT ---
let cropper: Cropper | null = null;
let pendingImageFile: File | null = null;

let state = {
  apiKey: '',
  appState: AppState.API_KEY_NEEDED,
  prompt: '',
  activeCreativePrompts: new Set<string>(),
  uploadedImages: [] as UploadedImage[],
  uploadedVideo: null as UploadedVideo | null,
  generatedVideos: [] as GeneratedVideo[],
};

function setState(newState: Partial<typeof state>) {
  state = { ...state, ...newState };
  render();
}

// --- RENDER FUNCTIONS ---
function render() {
  // App visibility
  dom.mainApp.classList.toggle('hidden', state.appState === AppState.API_KEY_NEEDED);
  dom.apiKeyModal.classList.toggle('hidden', state.appState !== AppState.API_KEY_NEEDED);

  // Loading states
  const isEnhancing = state.appState === AppState.LOADING_ENHANCE;
  const isGenerating = state.appState === AppState.LOADING_GENERATE;

  dom.enhancePromptButton.disabled = isEnhancing || isGenerating;
  dom.enhancePromptIcon.innerHTML = isEnhancing ? `<span class="loader"></span>` : dom.enhancePromptButton.querySelector('svg')!.outerHTML;
  
  dom.generateButton.disabled = isGenerating || isEnhancing;
  dom.generateButtonIcon.innerHTML = isGenerating ? `<span class="loader"></span>` : dom.generateButton.querySelector('svg')!.outerHTML;
  dom.generateButtonText.textContent = isGenerating ? 'در حال ساخت ویدیو...' : 'Generate Video';

  // Render media
  renderVideoUpload();
  renderImageUploads();
  renderResults();
}

function renderVideoUpload() {
    dom.videoUploadSlot.innerHTML = '';
    if (state.uploadedVideo) {
        const preview = createVideoPreview(state.uploadedVideo);
        dom.videoUploadSlot.appendChild(preview);
    } else {
        const uploader = createUploader('ویدیو', 'video/*', handleFileChange);
        dom.videoUploadSlot.appendChild(uploader);
    }
}

function renderImageUploads() {
    dom.imageUploadGrid.innerHTML = '';
    state.uploadedImages.forEach(img => {
        const preview = createImagePreview(img);
        dom.imageUploadGrid.appendChild(preview);
    });
    if (state.uploadedImages.length < 4) {
        const uploader = createUploader('تصویر', 'image/*', handleFileChange);
        dom.imageUploadGrid.appendChild(uploader);
    }
}

function renderResults() {
    dom.resultsGallery.innerHTML = '';
    if (state.generatedVideos.length > 0) {
        state.generatedVideos.slice().reverse().forEach(video => {
            const card = createResultCard(video);
            dom.resultsGallery.appendChild(card);
        });
    }
}

// --- UI COMPONENTS & HELPERS ---
function createUploader(label: string, accept: string, onChange: (e: Event) => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = "w-32 h-24 bg-gray-800/50 hover:bg-gray-700/80 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-white transition-colors p-2";
  button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path></svg><span class="text-xs mt-1 text-center">بارگذاری ${label}</span>`;
  
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = accept;
  fileInput.className = "hidden";
  fileInput.addEventListener('change', onChange);
  
  button.onclick = () => fileInput.click();
  button.appendChild(fileInput);
  return button;
}

function createVideoPreview(video: UploadedVideo) {
    const container = document.createElement('div');
    container.className = "relative group w-48 h-28";
    const vid = document.createElement('video');
    vid.src = URL.createObjectURL(video.file);
    vid.className = "w-full h-full object-cover rounded-lg";
    vid.muted = true;
    vid.loop = true;
    vid.autoplay = true;
    
    const removeBtn = createRemoveButton(() => {
        setState({ uploadedVideo: null, uploadedImages: [] }); // Video extension is exclusive
    });
    container.append(vid, removeBtn);
    return container;
}

function createImagePreview(image: UploadedImage) {
  const container = document.createElement('div');
  container.className = "relative group w-32 h-24";
  const img = document.createElement('img');
  img.src = `data:${image.mimeType};base64,${image.croppedBase64}`;
  img.className = "w-full h-full object-cover rounded-lg";
  
  const removeBtn = createRemoveButton(() => {
      setState({ uploadedImages: state.uploadedImages.filter(i => i.id !== image.id) });
  });
  container.append(img, removeBtn);
  return container;
}

function createRemoveButton(onClick: () => void) {
    const button = document.createElement('button');
    button.className = "absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-red-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all";
    button.innerHTML = `&times;`;
    button.onclick = onClick;
    return button;
}

function createResultCard(video: GeneratedVideo) {
    const card = document.createElement('div');
    card.className = 'shen-bg-dark shen-border rounded-xl overflow-hidden flex flex-col';

    const videoContainer = document.createElement('div');
    videoContainer.className = 'w-full aspect-video bg-black';
    const videoEl = document.createElement('video');
    videoEl.src = video.url;
    videoEl.controls = true;
    videoEl.className = 'w-full h-full';
    videoContainer.appendChild(videoEl);

    const infoContainer = document.createElement('div');
    infoContainer.className = 'p-3 flex-grow flex flex-col justify-between';
    
    const promptText = document.createElement('p');
    promptText.className = 'text-xs text-gray-400 line-clamp-2';
    promptText.textContent = video.prompt;
    infoContainer.appendChild(promptText);

    const controls = document.createElement('div');
    controls.className = 'flex items-center justify-end gap-2 mt-2';

    const downloadBtn = document.createElement('a');
    downloadBtn.href = video.url;
    downloadBtn.download = `SHENematic_${Date.now()}.mp4`;
    downloadBtn.className = 'p-2 shen-button-secondary rounded-full'
    downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`;
    downloadBtn.title = 'دانلود';

    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'p-2 shen-button-secondary rounded-full';
    fullscreenBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15" /></svg>`;
    fullscreenBtn.title = 'تمام‌صفحه';
    fullscreenBtn.onclick = () => {
        if (videoEl.requestFullscreen) videoEl.requestFullscreen();
    };

    controls.append(fullscreenBtn, downloadBtn);
    infoContainer.appendChild(controls);
    card.append(videoContainer, infoContainer);
    return card;
}


// --- API & BUSINESS LOGIC ---
const getAiClient = () => {
    if (!state.apiKey) throw new Error("API Key is not set.");
    return new GoogleGenAI({ apiKey: state.apiKey });
};

async function enhancePrompt(userPrompt: string): Promise<string> {
    if (!userPrompt.trim()) return '';
    const ai = getAiClient();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: `Analyze the user's prompt and enhance it into a professional, cinematic shot list for the Veo video generation model. The output must be a single, detailed paragraph in English. Break down the user's idea into subject, action, environment, and mood. Then, combine these elements with advanced cinematic techniques like specific camera angles (e.g., low-angle shot, aerial view), camera movements (e.g., dolly in, crane shot), lighting styles (e.g., golden hour, rim lighting), and visual styles (e.g., photorealistic, hyper-detailed, 8K). User prompt: "${userPrompt}"`,
            config: { responseMimeType: 'text/plain' }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Prompt enhancement failed:", error);
        throw new Error("Failed to enhance prompt. Please check your API key and try again.");
    }
}

async function generateVideo() {
    setState({ appState: AppState.LOADING_GENERATE });
    try {
        const ai = getAiClient();
        let params: any = {
            prompt: state.prompt,
            model: 'veo-3.1-fast-generate-preview',
            config: {
                numberOfVideos: 1,
                aspectRatio: '16:9',
                resolution: '720p',
            },
        };

        if (state.uploadedVideo) {
            alert("در صورت بارگذاری ویدیو، پروژه به صورت گسترش ویدیوی فرستاده شده از سمت شما ادامه خواهد یافت. شروع فیلم از فریم انتهایی ویدیوی شما خواهد بود!");
            params.model = 'veo-3.1-generate-preview';
            params.video = state.uploadedVideo.base64;
        } else if (state.uploadedImages.length > 0) {
            const referenceImagesPayload: VideoGenerationReferenceImage[] = state.uploadedImages.map(img => ({
                image: { imageBytes: img.croppedBase64, mimeType: img.mimeType },
                referenceType: VideoGenerationReferenceType.ASSET
            }));
            params.config.referenceImages = referenceImagesPayload;
            params.model = 'veo-3.1-generate-preview';
        }

        let operation = await ai.models.generateVideos(params);

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({ operation });
        }

        if (operation?.response?.generatedVideos?.[0]?.video?.uri) {
            const uri = operation.response.generatedVideos[0].video.uri;
            const res = await fetch(`${uri}&key=${state.apiKey}`);
            if (!res.ok) throw new Error(`Failed to fetch video: ${res.statusText}`);
            const blob = await res.blob();
            
            const newVideo: GeneratedVideo = {
                url: URL.createObjectURL(blob),
                blob,
                prompt: state.prompt,
            };
            setState({ generatedVideos: [...state.generatedVideos, newVideo] });

        } else {
            throw new Error("No video was generated or the operation failed.");
        }
    } catch (error) {
        console.error("Video generation failed:", error);
        alert(`Video generation failed: ${error.message}`);
    } finally {
        setState({ appState: AppState.IDLE });
    }
}

// --- UTILITY FUNCTIONS ---
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

function updatePromptFromState() {
    const basePrompt = state.prompt.split(',').map(s => s.trim()).filter(s => !CREATIVE_PROMPTS.hasOwnProperty(s)).join(', ');
    const activePrompts = Array.from(state.activeCreativePrompts);
    const newPrompt = [basePrompt, ...activePrompts].filter(Boolean).join(', ');
    dom.promptInput.value = newPrompt;
    setState({ prompt: newPrompt });
    autoResizeTextarea();
}

function autoResizeTextarea() {
    const textarea = dom.promptInput;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
}

// --- EVENT HANDLERS ---
function handleSaveApiKey() {
  const key = dom.apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem('gemini-api-key', key);
    setState({ apiKey: key, appState: AppState.IDLE });
  } else {
    alert("لطفاً یک کلید API معتبر وارد کنید.");
  }
}

function showModal(modal: HTMLElement) {
    dom.modalBackdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
}

function hideAllModals() {
    dom.modalBackdrop.classList.add('hidden');
    dom.apiKeyModal.classList.add('hidden');
    dom.helpModal.classList.add('hidden');
    dom.guideModal.classList.add('hidden');
    dom.cropperModal.classList.add('hidden');
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
}

function handleCreativePromptToggle(e: Event) {
    const button = e.currentTarget as HTMLButtonElement;
    const promptText = button.dataset.prompt!;
    const description = CREATIVE_PROMPTS[promptText];
    let statusText = '';
    let statusColor = '';

    if (state.activeCreativePrompts.has(promptText)) {
        state.activeCreativePrompts.delete(promptText);
        button.setAttribute('aria-pressed', 'false');
        statusText = 'غیرفعال شد';
        statusColor = 'text-red-400';
    } else {
        state.activeCreativePrompts.add(promptText);
        button.setAttribute('aria-pressed', 'true');
        statusText = 'فعال شد';
        statusColor = 'text-green-400';
    }

    dom.helpModalTitle.textContent = promptText;
    dom.helpModalContent.textContent = description;
    dom.helpModalStatus.textContent = statusText;
    dom.helpModalStatus.className = `text-center text-xl font-bold mt-4 ${statusColor}`;
    showModal(dom.helpModal);
    
    updatePromptFromState();
}

async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
        pendingImageFile = file;
        dom.cropperContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        dom.cropperContainer.appendChild(img);
        cropper = new Cropper(img, { aspectRatio: 16/9 });
        showModal(dom.cropperModal);
    } else if (file.type.startsWith('video/')) {
        const base64 = await fileToBase64(file);
        setState({ uploadedVideo: { file, base64 }, uploadedImages: [] }); // Video is exclusive
    }
    (e.target as HTMLInputElement).value = '';
}

function handleConfirmCrop() {
    if (!cropper || !pendingImageFile) return;
    cropper.getCroppedCanvas().toBlob(async (blob) => {
        if (!blob) return;
        const croppedBase64 = await fileToBase64(new File([blob], pendingImageFile!.name, { type: pendingImageFile!.type }));
        const newImage: UploadedImage = {
            id: Date.now().toString(),
            originalFile: pendingImageFile!,
            croppedBase64,
            mimeType: pendingImageFile!.type,
        };
        setState({ uploadedImages: [...state.uploadedImages, newImage], uploadedVideo: null }); // Images are exclusive
        hideAllModals();
    }, pendingImageFile.type);
}

async function handleEnhancePrompt() {
    setState({ appState: AppState.LOADING_ENHANCE });
    try {
        const enhanced = await enhancePrompt(state.prompt);
        setState({ prompt: enhanced });
        dom.promptInput.value = enhanced;
        autoResizeTextarea();
    } catch (error) {
        alert(error.message);
    } finally {
        setState({ appState: AppState.IDLE });
    }
}

// --- INITIALIZATION ---
function init() {
  // Check for saved API key
  const savedKey = localStorage.getItem('gemini-api-key');
  if (savedKey) {
    setState({ apiKey: savedKey, appState: AppState.IDLE });
  } else {
    setState({ appState: AppState.API_KEY_NEEDED });
  }

  // Populate creative prompts
  Object.entries(CREATIVE_PROMPTS).forEach(([prompt, desc]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = "shen-button-toggle shen-button-secondary px-3 py-1.5 rounded-lg transition-colors text-sm border border-transparent";
      button.textContent = prompt;
      button.dataset.prompt = prompt;
      button.setAttribute('aria-pressed', 'false');
      button.onclick = handleCreativePromptToggle;
      dom.creativePromptsContainer.appendChild(button);
  });
  
  // Attach event listeners
  dom.saveApiKeyButton.addEventListener('click', handleSaveApiKey);
  dom.helpModalClose.addEventListener('click', hideAllModals);
  dom.guideModalClose.addEventListener('click', hideAllModals);
  dom.openGuideButton.addEventListener('click', () => showModal(dom.guideModal));
  dom.cancelCropButton.addEventListener('click', hideAllModals);
  dom.confirmCropButton.addEventListener('click', handleConfirmCrop);
  dom.modalBackdrop.addEventListener('click', hideAllModals);

  dom.promptInput.addEventListener('input', (e) => {
      setState({ prompt: (e.target as HTMLTextAreaElement).value });
      autoResizeTextarea();
  });
  dom.copyPromptButton.addEventListener('click', () => {
      navigator.clipboard.writeText(state.prompt);
      alert('پرامپت کپی شد!');
  });
  dom.enhancePromptButton.addEventListener('click', handleEnhancePrompt);
  dom.generateButton.addEventListener('click', generateVideo);
  
  render();
}

document.addEventListener('DOMContentLoaded', init);