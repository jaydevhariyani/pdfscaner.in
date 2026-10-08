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
  pageCountText.textContent = `Pages Scanned: ${pages.length}`;
  renderThumbs();
  createPdfBtn.disabled = pages.length === 0;
  resetBtn.disabled = pages.length === 0;
}

function renderThumbs() {
  pageThumbs.innerHTML = '';
  pages.forEach((p, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-card';
    const img = document.createElement('img');
    img.src = p.dataUrl;
    img.title = `Page ${idx + 1}`;
    const removeBtn = document.createElement('div');
    removeBtn.className = 'thumb-remove';
    removeBtn.textContent = '✕';
    removeBtn.onclick = () => removePage(idx);
    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
    pageThumbs.appendChild(wrap);
  });
}

function removePage(idx) {
  if (confirm(`Remove Page ${idx + 1}?`)) {
    pages.splice(idx, 1);
    updatePageCount();
    status.textContent = `Page ${idx + 1} removed.`;
  }
}

async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: currentFacing,
        width: { ideal: 2560 },
        height: { ideal: 1920 }
      }
    });
    video.srcObject = stream;
    status.textContent = 'Camera ready. Position document & capture.';
  } catch (err) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacing, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      video.srcObject = stream;
      status.textContent = 'Camera active (standard mode).';
    } catch (e2) {
      status.textContent = 'Camera access blocked: ' + e2.message;
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
  
  preview.src = canvas.toDataURL('image/jpeg', 0.98);
  video.style.display = 'none';
  cropArea.style.display = 'block';
  if (cropper) { cropper.destroy(); cropper = null; }

  // aspectRatio: NaN enables 100% free width and height resizing!
  cropper = new Cropper(preview, {
    aspectRatio: NaN,
    viewMode: 1,
    dragMode: 'crop',
    autoCropArea: 0.9,
    background: false,
    zoomable: true,
    scalable: true,
    movable: true,
    rotatable: true,
    guides: true,
    cropBoxMovable: true,
    cropBoxResizable: true,
    ready() {
      if (autoEdgeToggle.checked) runAutoEdgeDetection();
    }
  });

  captureBtn.disabled = true;
  createPdfBtn.disabled = false;
  nextBtn.disabled = false;
  status.textContent = 'Adjust box horizontally or vertically as needed.';
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
  status.textContent = 'Scan next page... Click Capture.';
  startCamera();
};

createPdfBtn.onclick = () => {
  if (cropper) saveCurrentPage();
  if (pages.length === 0) {
    status.textContent = 'Scan at least one page first!';
    return;
  }
  status.textContent = 'Compiling PDF document...';
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  pages.forEach((p, i) => {
    if (i > 0) pdf.addPage();
    // Maintain natural proportional fit on standard A4 canvas
    pdf.addImage(p.dataUrl, 'JPEG', 10, 10, 190, 277, undefined, 'FAST');
  });

  const fileName = (filenameInput.value || 'Scanned-Doc').trim() + '.pdf';
  pdf.save(fileName);
  status.textContent = `✅ Saved ${fileName} (${pages.length} pages)`;
};

resetBtn.onclick = () => {
  if (confirm('Clear all captured pages?')) {
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
    status.textContent = 'Workspace reset. Ready to scan.';
    startCamera();
  }
};

function saveCurrentPage() {
  if (cropper) {
    const croppedCanvas = cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      fillColor: '#ffffff',
      maxWidth: 2600,
      maxHeight: 3600
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
      tmpCanvas.width = w; tmpCanvas.height = h;
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(tmpImg, 0, 0, w, h);
      const imageData = tmpCtx.getImageData(0, 0, w, h);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      }

      const edges = new Uint8ClampedArray(w * h);
      const gray = new Uint8ClampedArray(w * h);
      for (let i = 0; i < data.length; i += 4) gray[i / 4] = data[i];

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const gx = -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] -
                      2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] -
                      gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
          const gy = -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
                      gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
          edges[y * w + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        }
      }

      let minX = w, minY = h, maxX = 0, maxY = 0;
      let found = false;
      for (let i = 0; i < edges.length; i++) {
        if (edges[i] > 55) {
          const x = i % w, y = Math.floor(i / w);
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          found = true;
        }
      }

      if (!found || maxX <= minX || maxY <= minY) return;

      const pad = 12;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(w, maxX + pad);
      maxY = Math.min(h, maxY + pad);

      const sx = tmpImg.width / w;
      const sy = tmpImg.height / h;

      if (cropper) {
        cropper.setData({
          x: minX * sx,
          y: minY * sy,
          width: (maxX - minX) * sx,
          height: (maxY - minY) * sy
        });
      }
    };
    tmpImg.src = imgData;
  } catch (e) {
    console.warn(e);
  }
}
