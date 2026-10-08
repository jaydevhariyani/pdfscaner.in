const video = document.getElementById('video');
const preview = document.getElementById('preview');
const cropArea = document.getElementById('cropArea');
const captureBtn = document.getElementById('captureBtn');
const nextBtn = document.getElementById('nextBtn');
const createPdfBtn = document.getElementById('createPdf');
const resetBtn = document.getElementById('resetBtn');
const cameraToggleBtn = document.getElementById('cameraToggle');
const autoEdgeToggle = document.getElementById('autoEdgeToggle');
const filenameInput = document.getElementById('filenameInput');
const status = document.getElementById('status');
const pageCountText = document.getElementById('pageCountText');
const pageThumbs = document.getElementById('pageThumbs');

let stream = null;
let cropper = null;
let pages = [];
let currentFacing = 'environment';

function updatePageCount() {
  pageCountText.textContent = `Pages Captured: ${pages.length}`;
  renderThumbs();
  createPdfBtn.disabled = pages.length === 0;
  resetBtn.disabled = pages.length === 0;
}

function renderThumbs() {
  pageThumbs.innerHTML = '';
  pages.forEach((p, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'page-thumb-box';
    const img = document.createElement('img');
    img.src = p.dataUrl;
    img.className = 'page-thumb';
    img.title = `Page ${idx + 1}`;
    const overlay = document.createElement('span');
    overlay.className = 'page-thumb-overlay';
    overlay.textContent = '×';
    overlay.onclick = () => removePage(idx);
    wrap.appendChild(img);
    wrap.appendChild(overlay);
    pageThumbs.appendChild(wrap);
  });
}

function removePage(idx) {
  if (confirm(`Are you sure you want to remove Page ${idx + 1}?`)) {
    pages.splice(idx, 1);
    updatePageCount();
    status.textContent = `Page ${idx + 1} has been removed.`;
  }
}

async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: currentFacing,
        width: { ideal: 2560 },
        height: { ideal: 1920 },
        advanced: [{ focusMode: "continuous" }]
      }
    });
    video.srcObject = stream;
    status.textContent = 'કેમેરા તૈયાર છે. મોબાઈલને સીધો રાખીને ડોક્યુમેન્ટને ફ્રેમમાં ભરો અને Capture Page દબાવો.';
  } catch (err) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacing, width: { ideal: 1920 }, height: { ideal: 1440 } }
      });
      video.srcObject = stream;
      status.textContent = 'કેમેરા તૈયાર છે (સામાન્ય ક્વોલિટી). Capture Page દબાવો.';
    } catch (e2) {
      status.textContent = 'Camera permission error: ' + e2.message;
    }
  }
}

cameraToggleBtn.onclick = async () => {
  currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
  await startCamera();
};

startCamera();

captureBtn.onclick = () => {
  if (!stream) { startCamera(); return; }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = canvas.toDataURL('image/jpeg', 0.97);
  preview.src = imageData;
  video.style.display = 'none';
  cropArea.style.display = 'block';
  if (cropper) { cropper.destroy(); cropper = null; }

  cropper = new Cropper(preview, {
    aspectRatio: 210 / 297,
    viewMode: 1,
    dragMode: 'crop',
    autoCropArea: 0.92,
    background: false,
    zoomable: true,
    guides: true,
    ready() {
      if (autoEdgeToggle.checked) runAutoEdgeDetection();
    }
  });

  captureBtn.disabled = true;
  createPdfBtn.disabled = false;
  nextBtn.disabled = false;
  status.textContent = 'A4 સાઈઝ મુજબ ક્રોપ કરો. પછી Next Page અથવા Create PDF દબાવો.';
};

nextBtn.onclick = () => {
  saveCurrentPage();
  if (cropper) cropper.destroy();
  cropper = null;
  preview.src = '';
  cropArea.style.display = 'none';
  video.style.display = 'block';
  captureBtn.disabled = false;
  nextBtn.disabled = true;
  status.textContent = 'આગળનું પેજ સ્કેન કરો... Capture Page દબાવો.';
  startCamera();
};

createPdfBtn.onclick = () => {
  if (cropper) saveCurrentPage();
  if (pages.length === 0) {
    status.textContent = 'Please capture at least one page first!';
    return;
  }
  status.textContent = 'Generating PDF... please wait';
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pages.forEach((p, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(p.dataUrl, 'JPEG', 8, 8, 194, 281, undefined, 'FAST');
  });
  const fileName = (filenameInput.value || 'Scanned-Document').trim() + '.pdf';
  pdf.save(fileName);
  status.textContent = `✅ PDF created: ${fileName} (Total ${pages.length} pages)`;
};

resetBtn.onclick = () => {
  if (confirm('Are you sure you want to delete all captured pages?')) {
    pages = [];
    if (cropper) { cropper.destroy(); cropper = null; }
    preview.src = '';
    cropArea.style.display = 'none';
    video.style.display = 'block';
    captureBtn.disabled = false;
    nextBtn.disabled = true;
    createPdfBtn.disabled = true;
    resetBtn.disabled = true;
    updatePageCount();
    status.textContent = 'All pages cleared. Start a new scan.';
    startCamera();
  }
};

function saveCurrentPage() {
  if (cropper) {
    const croppedCanvas = cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      fillColor: '#ffffff',
      maxWidth: 2500,
      maxHeight: 3500
    });
    if (croppedCanvas) {
      pages.push({ dataUrl: croppedCanvas.toDataURL('image/jpeg', 0.95) });
      updatePageCount();
    }
  }
}

function runAutoEdgeDetection() {
  try {
    const imgData = preview.src;
    if (!imgData) return;
    const tmpImg = new Image();
    tmpImg.onload = () => {
      const w = Math.min(900, tmpImg.width);
      const h = (tmpImg.height * w) / tmpImg.width;
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = w;
      tmpCanvas.height = h;
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(tmpImg, 0, 0, w, h);
      const imageData = tmpCtx.getImageData(0, 0, w, h);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        data[i] = data[i + 1] = data[i + 2] = avg;
      }

      const edges = new Uint8ClampedArray(w * h);
      const gray = new Uint8ClampedArray(w * h);
      for (let i = 0; i < data.length; i += 4) gray[i / 4] = data[i];

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const gx =
            -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
            -2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] +
            -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
          const gy =
            -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
             gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
          edges[y * w + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        }
      }

      let minX = w, minY = h, maxX = 0, maxY = 0;
      let found = false;
      const threshold = 55;

      for (let i = 0; i < edges.length; i++) {
        if (edges[i] > threshold) {
          const x = i % w;
          const y = Math.floor(i / w);
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          found = true;
        }
      }

      if (!found || maxX <= minX || maxY <= minY) return;

      const padding = 12;
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(w, maxX + padding);
      maxY = Math.min(h, maxY + padding);

      const scaleX = tmpImg.width / w;
      const scaleY = tmpImg.height / h;

      if (cropper) {
        cropper.setData({
          x: minX * scaleX,
          y: minY * scaleY,
          width: (maxX - minX) * scaleX,
          height: (maxY - minY) * scaleY
        });
        status.textContent = 'Auto-edge applied. A4 ratio મુજબ adjust કરી શકો છો.';
      }
    };
    tmpImg.src = imgData;
  } catch (e) {
    console.warn('Auto edge failed:', e);
  }
}
