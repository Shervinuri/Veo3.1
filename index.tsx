/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type, VideoGenerationReferenceImage, VideoGenerationReferenceType, Modality } from "@google/genai";

declare var Cropper: any;

// --- TYPE DEFINITIONS ---
enum AppState {
  API_KEY_SELECTION_NEEDED,
  IDLE,
  LOADING_ENHANCE,
  LOADING_GENERATE,
  ERROR,
}

type ImageDesignation = 'start' | 'end' | 'reference' | 'none';

interface UploadedImage {
  id: string;
  croppedBase64: string;
  mimeType: string;
  designation: ImageDesignation;
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
  imageGenModal: getElem('image-gen-modal'),
  imageGenCloseButton: getElem<HTMLButtonElement>('image-gen-close-button'),
  imageGenDisplay: getElem('image-gen-display'),
  imageGenPrompt: getElem<HTMLTextAreaElement>('image-gen-prompt'),
  imageGenButton: getElem<HTMLButtonElement>('image-gen-button'),
  imageGenActions: getElem('image-gen-actions'),
  regenerateImageButton: getElem<HTMLButtonElement>('regenerate-image-button'),
  transferImageButton: getElem<HTMLButtonElement>('transfer-image-button'),

  // Main App
  mainApp: getElem('main-app'),
  changeApiKeyButton: getElem<HTMLButtonElement>('change-api-key-button'),
  mainControlsFieldset: getElem<HTMLFieldSetElement>('main-controls-fieldset'),
  promptInput: getElem<HTMLTextAreaElement>('prompt-input'),
  copyPromptButton: getElem<HTMLButtonElement>('copy-prompt-button'),
  creativePromptsContainer: getElem('creative-prompts-container'),
  enhancePromptButton: getElem<HTMLButtonElement>('enhance-prompt-button'),
  enhancePromptIcon: getElem('enhance-prompt-icon'),
  
  // Media Uploads
  mediaUploadControls: getElem('media-upload-controls'),
  mediaGallery: getElem('media-gallery'),
  imageFileInput: getElem<HTMLInputElement>('image-file-input'),

  // Generation
  generateButton: getElem<HTMLButtonElement>('generate-button'),
  generateButtonIcon: getElem('generate-button-icon'),
  generateButtonText: getElem('generate-button-text'),
  resultsGallery: getElem('results-gallery'),
};

// --- STATE MANAGEMENT ---
let cropper: any | null = null;
let pendingImageFile: File | null = null;
let originalEnhanceIconHTML: string = '';
let originalGenerateIconHTML: string = '';
let helpModalTimeoutId: number | null = null;
let pendingGeneratedImage: { base64: string; mimeType: string } | null = null;
let isGeneratingImage = false;

let state = {
  appState: AppState.API_KEY_SELECTION_NEEDED,
  prompt: '',
  activeCreativePrompts: new Set<string>(),
  uploadedImages: [] as UploadedImage[],
  generatedVideos: [] as GeneratedVideo[],
};

function setState(newState: Partial<typeof state>) {
  const oldState = { ...state };
  state = { ...state, ...newState };
  render(oldState);
}

// --- RENDER FUNCTIONS ---
function render(oldState: typeof state) {
  const needsApiKey = state.appState === AppState.API_KEY_SELECTION_NEEDED;
  const isEnhancing = state.appState === AppState.LOADING_ENHANCE;
  const isGenerating = state.appState === AppState.LOADING_GENERATE;

  // disable/enable main controls
  dom.mainControlsFieldset.disabled = needsApiKey;
  
  // Still need to manage disabled state for loading, etc. on top of the fieldset
  dom.enhancePromptButton.disabled = needsApiKey || isEnhancing || isGenerating;
  dom.generateButton.disabled = needsApiKey || isGenerating || isEnhancing || !state.prompt.trim();

  if (state.appState !== oldState.appState) {
    dom.enhancePromptIcon.innerHTML = isEnhancing ? `<span class="loader"></span>` : originalEnhanceIconHTML;
    dom.generateButtonIcon.innerHTML = isGenerating ? `<span class="loader"></span>` : originalGenerateIconHTML;
  }
  
  dom.generateButtonText.textContent = isGenerating ? 'در حال ساخت ویدیو...' : 'ساخت ویدیو';
  
  // Render media if changed
  renderMediaUploads();
  renderResults();
}


function renderMediaUploads() {
    dom.mediaUploadControls.innerHTML = '';
    dom.mediaGallery.innerHTML = '';

    // Render upload buttons
    const imageUploader = createUploader('بارگذاری تصویر');
    imageUploader.onclick = handleImageUploadClick;

    const imageGenerator = createUploader('خلق تصویر با AI');
    imageGenerator.onclick = () => showModal(dom.imageGenModal);
    imageGenerator.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M11.645 2.007a.75.75 0 0 1 .71 0l4.5 2.25a.75.75 0 0 1 .364.646v11.25a.75.75 0 0 1-.502.715l-4.5 2.25a.75.75 0 0 1-.71 0l-4.5-2.25A.75.75 0 0 1 6 16.153V4.904a.75.75 0 0 1 .364-.646l4.5-2.25ZM10.5 6a.75.75 0 0 0 .75.75h.008a.75.75 0 0 0 .75-.75v-.008a.75.75 0 0 0-.75-.75h-.008a.75.75 0 0 0-.75.75v.008ZM10.5 9a.75.75 0 0 0 .75.75h.008a.75.75 0 0 0 .75-.75v-.008a.75.75 0 0 0-.75-.75h-.008a.75.75 0 0 0-.75.75v.008ZM10.5 12a.75.75 0 0 0 .75.75h.008a.75.75 0 0 0 .75-.75v-.008a.75.75 0 0 0-.75-.75h-.008a.75.75 0 0 0-.75.75v.008Z" /></svg><span>خلق تصویر</span>`;
    
    dom.mediaUploadControls.append(imageUploader, imageGenerator);

    // Render previews
    state.uploadedImages.forEach(img => {
        const preview = createImagePreview(img);
        dom.mediaGallery.appendChild(preview);
    });
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
function createUploader(label: string) {
  const container = document.createElement('button');
  container.type = 'button';
  container.className = "flex-grow px-4 py-3 shen-button-secondary rounded-lg flex items-center justify-center gap-2";
  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clip-rule="evenodd" /></svg><span>${label}</span>`;
  return container;
}

function createImagePreview(image: UploadedImage) {
  const container = document.createElement('div');
  container.className = "relative group aspect-video";
  const img = document.createElement('img');
  img.src = `data:${image.mimeType};base64,${image.croppedBase64}`;
  img.className = "w-full h-full object-cover rounded-lg";
  
  const removeBtn = createRemoveButton(() => {
    setState({ uploadedImages: state.uploadedImages.filter(i => i.id !== image.id) });
  });

  const controls = document.createElement('div');
  controls.className = "absolute bottom-0 left-0 right-0 bg-black/70 p-1 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity";

  const designations: Array<{ type: ImageDesignation, label: string }> = [
      { type: 'start', label: 'شروع' },
      { type: 'end', label: 'پایان' },
      { type: 'reference', label: 'مرجع' }
  ];

  designations.forEach(({ type, label }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      const isActive = image.designation === type;
      btn.className = `text-xs px-2 py-0.5 rounded ${isActive ? 'bg-purple-600 text-white' : 'bg-gray-600 text-gray-200'} hover:bg-purple-500 transition-colors`;
      btn.onclick = (e) => {
        e.stopPropagation();
        handleDesignateImage(image.id, type);
      };
      controls.appendChild(btn);
  });

  container.append(img, controls, removeBtn);
  return container;
}

function createRemoveButton(onClick: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = "absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-red-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all z-10";
    button.innerHTML = `&times;`;
    button.onclick = (e) => {
        e.stopPropagation();
        onClick();
    };
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
    downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3a.75.75 0 0 1 .75-.75Zm-9 13.5a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd" /></svg>`;
    downloadBtn.title = 'دانلود';
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'p-2 shen-button-secondary rounded-full';
    fullscreenBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M15 3.75a2.25 2.25 0 0 1 2.25 2.25v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 1 0-1.5h1.5ZM9 3.75a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 0-.75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A2.25 2.25 0 0 1 6 3.75h3ZM9 20.25a.75.75 0 0 1 0-1.5h-1.5a.75.75 0 0 0-.75-.75v-1.5a.75.75 0 0 1-1.5 0v1.5A2.25 2.25 0 0 1 6 20.25h3Zm6 0a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5a2.25 2.25 0 0 1-2.25 2.25h-3Z" /></svg>`;
    fullscreenBtn.title = 'تمام‌صفحه';
    fullscreenBtn.onclick = () => { if (videoEl.requestFullscreen) videoEl.requestFullscreen(); };
    controls.append(fullscreenBtn, downloadBtn);
    infoContainer.appendChild(controls);
    card.append(videoContainer, infoContainer);
    return card;
}


// --- API & BUSINESS LOGIC ---
const getAiClient = () => {
    const apiKey = localStorage.getItem('gemini-api-key');
    if (!apiKey) {
        setState({ appState: AppState.API_KEY_SELECTION_NEEDED });
        showModal(dom.apiKeyModal);
        throw new Error("کلید API یافت نشد. لطفاً کلید خود را وارد کنید.");
    }
    return new GoogleGenAI({ apiKey });
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

async function generateImageWithNanoBanana(prompt: string): Promise<{ base64: string, mimeType: string }> {
    if (!prompt.trim()) {
        throw new Error("A prompt is required to generate an image.");
    }
    const ai = getAiClient();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return {
                    base64: part.inlineData.data,
                    mimeType: part.inlineData.mimeType,
                };
            }
        }
        throw new Error("No image was generated by the API.");
    } catch (error) {
        console.error("Image generation with nano banana failed:", error);
        throw new Error("Failed to generate image. Please check your prompt and API key.");
    }
}

async function generateVideo() {
    if (!state.prompt.trim()) {
        alert('لطفا ابتدا یک پرامپت بنویسید.');
        return;
    }
    setState({ appState: AppState.LOADING_GENERATE });
    try {
        const ai = getAiClient();
        const startFrame = state.uploadedImages.find(img => img.designation === 'start');
        const endFrame = state.uploadedImages.find(img => img.designation === 'end');
        const referenceImages = state.uploadedImages.filter(img => img.designation === 'reference');

        let params: any = {
            prompt: state.prompt,
            config: {
                numberOfVideos: 1,
                aspectRatio: '16:9',
                resolution: '720p',
            },
        };

        if (startFrame || endFrame) {
            params.model = 'veo-3.1-fast-generate-preview';
            if (startFrame) {
                params.image = { imageBytes: startFrame.croppedBase64, mimeType: startFrame.mimeType };
            }
            if (endFrame) {
                params.config.lastFrame = { imageBytes: endFrame.croppedBase64, mimeType: endFrame.mimeType };
            }
        } else if (referenceImages.length > 0) {
            params.model = 'veo-3.1-generate-preview';
            const referenceImagesPayload: VideoGenerationReferenceImage[] = referenceImages.map(img => ({
                image: { imageBytes: img.croppedBase64, mimeType: img.mimeType },
                referenceType: VideoGenerationReferenceType.ASSET
            }));
            params.config.referenceImages = referenceImagesPayload;
        } else {
            // Default text-to-video
            params.model = 'veo-3.1-fast-generate-preview';
        }

        let operation = await ai.models.generateVideos(params);

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({ operation });
        }

        if (operation?.response?.generatedVideos?.[0]?.video?.uri) {
            const uri = operation.response.generatedVideos[0].video.uri;
            const apiKey = localStorage.getItem('gemini-api-key');
            if (!apiKey) throw new Error("API Key not found while fetching video.");

            const res = await fetch(`${uri}&key=${apiKey}`);
            if (!res.ok) throw new Error(`Failed to fetch video: ${res.statusText}`);
            const blob = await res.blob();
            
            const newVideo: GeneratedVideo = { url: URL.createObjectURL(blob), blob, prompt: state.prompt, };
            setState({ generatedVideos: [...state.generatedVideos, newVideo], appState: AppState.IDLE });
        } else {
            throw new Error("No video was generated or the operation failed.");
        }
    } catch (error) {
        console.error("Video generation failed:", error);
        let errorMessage = "An unknown error occurred during video generation.";
        if (error instanceof Error) {
            errorMessage = error.message;
        } else {
            try {
                errorMessage = JSON.stringify(error);
            } catch { /* Ignore if not stringifiable */ }
        }

        if (errorMessage.includes("API key not valid") || errorMessage.includes("Requested entity was not found")) {
            alert("کلید API شما نامعتبر است یا مجوز لازم را ندارد. لطفاً یک کلید جدید وارد کرده و دوباره امتحان کنید.");
            localStorage.removeItem('gemini-api-key');
            setState({ appState: AppState.API_KEY_SELECTION_NEEDED });
            showModal(dom.apiKeyModal);
        } else {
            alert(`Video generation failed: ${errorMessage}`);
            setState({ appState: AppState.IDLE });
        }
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
    const basePrompt = dom.promptInput.value.split(',').map(s => s.trim()).filter(s => !CREATIVE_PROMPTS.hasOwnProperty(s)).join(', ');
    const activePrompts = Array.from(state.activeCreativePrompts);
    const newPrompt = [basePrompt, ...activePrompts].filter(Boolean).join(', ');
    dom.promptInput.value = newPrompt;
    setState({ prompt: newPrompt });
}

// --- EVENT HANDLERS ---
function handleSaveApiKey() {
    const apiKey = dom.apiKeyInput.value.trim();
    if (!apiKey) {
        alert('لطفاً کلید API خود را وارد کنید.');
        return;
    }
    localStorage.setItem('gemini-api-key', apiKey);
    setState({ appState: AppState.IDLE });
    hideAllModals();
}

function showModal(modal: HTMLElement) {
    dom.modalBackdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
}

function hideAllModals() {
    if (helpModalTimeoutId) {
        clearTimeout(helpModalTimeoutId);
        helpModalTimeoutId = null;
    }
    dom.modalBackdrop.classList.add('hidden');
    dom.apiKeyModal.classList.add('hidden');
    dom.helpModal.classList.add('hidden');
    dom.guideModal.classList.add('hidden');
    dom.cropperModal.classList.add('hidden');
    dom.imageGenModal.classList.add('hidden');
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    dom.imageFileInput.value = '';
    pendingImageFile = null;

    // Reset image gen modal
    pendingGeneratedImage = null;
    isGeneratingImage = false;
    dom.imageGenPrompt.value = '';
    dom.imageGenDisplay.innerHTML = '<span>تصویر شما اینجا ساخته می‌شود</span>';
    dom.imageGenActions.classList.add('hidden');
    dom.imageGenButton.classList.remove('hidden');
    dom.imageGenButton.disabled = false;
}

function handleCreativePromptToggle(e: Event) {
    // Clear any existing timer to prevent premature closing
    if (helpModalTimeoutId) {
        clearTimeout(helpModalTimeoutId);
        helpModalTimeoutId = null;
    }

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
    
    // Set a new timer to auto-hide the modal
    helpModalTimeoutId = window.setTimeout(() => {
        if (!dom.helpModal.classList.contains('hidden')) {
            hideAllModals(); 
        }
    }, 3000); // Auto-close after 3 seconds
    
    updatePromptFromState();
}

function handleImageUploadClick() {
    dom.imageFileInput.click();
}

function handleImageFileSelected(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    pendingImageFile = file;
    dom.cropperContainer.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    dom.cropperContainer.appendChild(img);
    
    if(cropper) {
        cropper.destroy();
    }

    cropper = new Cropper(img, { 
        aspectRatio: 16/9,
        viewMode: 2,
        background: false,
        autoCropArea: 1,
    });
    showModal(dom.cropperModal);
}

function handleConfirmCrop() {
    if (!cropper || !pendingImageFile) return;
    
    cropper.getCroppedCanvas().toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], pendingImageFile!.name, { type: pendingImageFile!.type });
        const croppedBase64 = await fileToBase64(file);
        const newImage: UploadedImage = {
            id: Date.now().toString(),
            croppedBase64,
            mimeType: pendingImageFile!.type,
            designation: 'none',
        };
        
        setState({ uploadedImages: [...state.uploadedImages, newImage] });
        hideAllModals();

    }, pendingImageFile.type);
}

function handleDesignateImage(imageId: string, newDesignation: ImageDesignation) {
    let toggledOff = false;
    
    let newImages = state.uploadedImages.map(img => {
        if (img.id === imageId && img.designation === newDesignation) {
            // User is toggling the current designation OFF
            toggledOff = true;
            return { ...img, designation: 'none' as ImageDesignation };
        }
        
        // If we are setting a unique role ('start' or 'end'), unset it from any other image.
        if ((newDesignation === 'start' || newDesignation === 'end') && img.designation === newDesignation) {
            return { ...img, designation: 'none' as ImageDesignation };
        }
        
        return img;
    });

    if (!toggledOff) {
        const targetImageIndex = newImages.findIndex(img => img.id === imageId);
        if (targetImageIndex > -1) {
            newImages[targetImageIndex] = { ...newImages[targetImageIndex], designation: newDesignation };
        }
    }

    setState({ uploadedImages: newImages });
}

async function handleEnhancePrompt() {
    setState({ appState: AppState.LOADING_ENHANCE });
    try {
        const enhanced = await enhancePrompt(state.prompt);
        dom.promptInput.value = enhanced;
        setState({ prompt: enhanced, appState: AppState.IDLE });
    } catch (error) {
        alert(error.message);
        setState({ appState: AppState.IDLE });
    }
}

async function handleGenerateImage() {
    const prompt = dom.imageGenPrompt.value;
    if (!prompt.trim() || isGeneratingImage) return;

    isGeneratingImage = true;
    dom.imageGenButton.disabled = true;
    dom.regenerateImageButton.disabled = true;
    dom.imageGenActions.classList.remove('hidden');
    dom.imageGenButton.classList.add('hidden');
    dom.imageGenDisplay.innerHTML = `<div class="flex flex-col items-center gap-2"><span class="loader"></span><span class="text-sm">در حال ساخت تصویر...</span></div>`;
    pendingGeneratedImage = null;

    try {
        const result = await generateImageWithNanoBanana(prompt);
        pendingGeneratedImage = { base64: result.base64, mimeType: result.mimeType };

        const img = document.createElement('img');
        img.src = `data:${result.mimeType};base64,${result.base64}`;
        img.className = 'w-full h-full object-contain';
        dom.imageGenDisplay.innerHTML = '';
        dom.imageGenDisplay.appendChild(img);
    } catch (error) {
        dom.imageGenDisplay.innerHTML = `<span class="text-red-400 text-sm p-4 text-center">${error.message}</span>`;
        dom.imageGenActions.classList.add('hidden');
        dom.imageGenButton.classList.remove('hidden');
    } finally {
        isGeneratingImage = false;
        dom.imageGenButton.disabled = false;
        dom.regenerateImageButton.disabled = false;
    }
}

function handleTransferImage() {
    if (!pendingGeneratedImage) return;

    const newImage: UploadedImage = {
        id: Date.now().toString(),
        croppedBase64: pendingGeneratedImage.base64,
        mimeType: pendingGeneratedImage.mimeType,
        designation: 'none',
    };

    setState({ uploadedImages: [...state.uploadedImages, newImage] });
    hideAllModals();
}


// --- INITIALIZATION ---
async function init() {
  originalEnhanceIconHTML = dom.enhancePromptIcon.innerHTML;
  originalGenerateIconHTML = dom.generateButtonIcon.innerHTML;

  // Check for existing API key
  const apiKey = localStorage.getItem('gemini-api-key');
  if (apiKey) {
    setState({ appState: AppState.IDLE });
  } else {
    setState({ appState: AppState.API_KEY_SELECTION_NEEDED });
    showModal(dom.apiKeyModal);
  }

  Object.entries(CREATIVE_PROMPTS).forEach(([prompt]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = "shen-button-toggle shen-button-secondary px-3 py-1.5 rounded-lg transition-colors text-sm border border-transparent";
      button.textContent = prompt;
      button.dataset.prompt = prompt;
      button.setAttribute('aria-pressed', 'false');
      button.onclick = handleCreativePromptToggle;
      dom.creativePromptsContainer.appendChild(button);
  });
  
  dom.saveApiKeyButton.addEventListener('click', handleSaveApiKey);
  dom.changeApiKeyButton.addEventListener('click', () => {
    const currentKey = localStorage.getItem('gemini-api-key');
    dom.apiKeyInput.value = currentKey || '';
    showModal(dom.apiKeyModal)
  });
  dom.helpModalClose.addEventListener('click', hideAllModals);
  dom.guideModalClose.addEventListener('click', hideAllModals);
  dom.openGuideButton.addEventListener('click', () => showModal(dom.guideModal));
  dom.cancelCropButton.addEventListener('click', hideAllModals);
  dom.confirmCropButton.addEventListener('click', handleConfirmCrop);
  dom.imageGenCloseButton.addEventListener('click', hideAllModals);
  dom.imageGenButton.addEventListener('click', handleGenerateImage);
  dom.regenerateImageButton.addEventListener('click', handleGenerateImage);
  dom.transferImageButton.addEventListener('click', handleTransferImage);
  
  // Add listeners to modals for "click outside" functionality.
  dom.modalBackdrop.addEventListener('click', () => {
    // Prevent closing the API key modal via backdrop click if a key is required
    if (state.appState === AppState.API_KEY_SELECTION_NEEDED && !dom.apiKeyModal.classList.contains('hidden')) {
      return;
    }
    hideAllModals();
  });

  [dom.helpModal, dom.guideModal, dom.cropperModal, dom.imageGenModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
          // If the click is on the modal wrapper itself (the "outside" area), close it.
          if (e.target === modal) {
              hideAllModals();
          }
      });
  });

  dom.imageFileInput.addEventListener('change', handleImageFileSelected);

  dom.promptInput.addEventListener('input', (e) => {
      setState({ prompt: (e.target as HTMLTextAreaElement).value });
  });
  dom.copyPromptButton.addEventListener('click', () => {
      if(!state.prompt) return;
      navigator.clipboard.writeText(state.prompt);
      alert('پرامپت کپی شد!');
  });
  dom.enhancePromptButton.addEventListener('click', handleEnhancePrompt);
  dom.generateButton.addEventListener('click', generateVideo);
  
  // Initial render
  setState({});
}

document.addEventListener('DOMContentLoaded', init);