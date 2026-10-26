/* ============================================
   A3 Collage Maker — Application Logic
   ============================================ */

(function () {
    'use strict';

    // ---- Constants ----
    const A3_WIDTH_MM = 420;
    const A3_HEIGHT_MM = 297;
    const MM_TO_PT = 2.83465;
    const HIGH_DPI_SCALE = 3;

    // rows × cols for each preset count
    const GRID_PRESETS_LANDSCAPE = {
        2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3],
        12: [3, 4], 16: [4, 4], 20: [4, 5], 24: [4, 6],
        30: [5, 6], 35: [5, 7], 40: [5, 8], 48: [6, 8], 60: [6, 10],
    };

    const GRID_PRESETS_PORTRAIT = {
        2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3],
        12: [4, 3], 16: [4, 4], 20: [5, 4], 24: [6, 4],
        30: [6, 5], 35: [7, 5], 40: [8, 5], 48: [8, 6], 60: [10, 6],
    };

    // ---- State ----
    const state = {
        images: [],
        orientation: 'landscape',
        rows: 4,
        cols: 6,
        padding: 5,
        margin: 5,
        bgColor: '#ffffff',
        pages: [],
        canvases: [],
    };

    // ---- DOM ----
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const dom = {
        dropZone: $('#drop-zone'),
        inputImages: $('#input-images'),
        inputFolder: $('#input-folder'),
        inputZip: $('#input-zip'),
        btnUploadImages: $('#btn-upload-images'),
        btnUploadFolder: $('#btn-upload-folder'),
        btnUploadZip: $('#btn-upload-zip'),
        uploadStatus: $('#upload-status'),
        imageCount: $('#image-count'),
        thumbnailStrip: $('#thumbnail-strip'),
        btnAddMore: $('#btn-add-more'),
        btnClearAll: $('#btn-clear-all'),
        configSection: $('#config-section'),
        orientationToggle: $('#orientation-toggle'),
        presetChips: $('#preset-chips'),
        inputRows: $('#input-rows'),
        inputCols: $('#input-cols'),
        gridTotal: $('#grid-total'),
        inputPadding: $('#input-padding'),
        paddingValue: $('#padding-value'),
        inputMargin: $('#input-margin'),
        marginValue: $('#margin-value'),
        inputBgColor: $('#input-bg-color'),
        bgColorLabel: $('#bg-color-label'),
        summaryPages: $('#summary-pages'),
        summaryImages: $('#summary-images'),
        btnGenerate: $('#btn-generate'),
        previewSection: $('#preview-section'),
        previewGrid: $('#preview-grid'),
        btnDownloadPdf: $('#btn-download-pdf'),
        progressOverlay: $('#progress-overlay'),
        progressText: $('#progress-text'),
        progressBar: $('#progress-bar'),
        progressDetail: $('#progress-detail'),
        toastContainer: $('#toast-container'),
    };

    // ---- Helpers ----

    function showToast(msg, type = 'info') {
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        dom.toastContainer.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            t.style.transform = 'translateX(30px)';
            t.style.transition = 'all 0.25s ease';
            setTimeout(() => t.remove(), 250);
        }, 3000);
    }

    function showProgress(text, detail) {
        dom.progressOverlay.style.display = 'flex';
        dom.progressText.textContent = text;
        dom.progressDetail.textContent = detail || '';
        dom.progressBar.style.width = '0%';
    }

    function updateProgress(pct, detail) {
        dom.progressBar.style.width = pct + '%';
        if (detail) dom.progressDetail.textContent = detail;
    }

    function hideProgress() {
        dom.progressOverlay.style.display = 'none';
    }

    function isImageFile(f) {
        return f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(f.name);
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Load failed'));
            img.src = src;
        });
    }

    // ---- Image Loading ----

    async function processFiles(files) {
        const imgs = Array.from(files).filter(isImageFile);
        if (!imgs.length) { showToast('No image files found', 'error'); return; }

        showProgress('Loading images…', `0 / ${imgs.length}`);
        let n = 0;

        for (const file of imgs) {
            try {
                const url = URL.createObjectURL(file);
                const img = await loadImage(url);
                state.images.push({
                    file, url, img,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    aspectRatio: img.naturalWidth / img.naturalHeight,
                });
                n++;
                updateProgress((n / imgs.length) * 100, `${n} / ${imgs.length}`);
            } catch (e) { console.warn('Skip:', file.name, e); }
        }

        hideProgress();
        showToast(`${n} images loaded`, 'success');
        onImagesChanged();
    }

    async function processZip(file) {
        showProgress('Extracting ZIP…', 'Reading archive');
        try {
            const zip = await JSZip.loadAsync(file);
            const entries = [];
            zip.forEach((p, e) => {
                if (!e.dir && /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(p)) entries.push(e);
            });

            if (!entries.length) { hideProgress(); showToast('No images in ZIP', 'error'); return; }

            let n = 0;
            for (const entry of entries) {
                try {
                    const blob = await entry.async('blob');
                    const name = entry.name.split('/').pop();
                    const f = new File([blob], name, { type: blob.type || 'image/jpeg' });
                    const url = URL.createObjectURL(f);
                    const img = await loadImage(url);
                    state.images.push({
                        file: f, url, img,
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                        aspectRatio: img.naturalWidth / img.naturalHeight,
                    });
                    n++;
                    updateProgress((n / entries.length) * 100, `${n} / ${entries.length}`);
                } catch (e) { console.warn('Skip ZIP entry:', entry.name, e); }
            }

            hideProgress();
            showToast(`${n} images from ZIP`, 'success');
            onImagesChanged();
        } catch (e) {
            hideProgress();
            showToast('Failed to read ZIP', 'error');
        }
    }

    function onImagesChanged() {
        updateUI();
        if (state.images.length > 0) suggestBestConfig();
    }

    // ---- Grouping & Sorting ----

    function groupAndSortImages() {
        const groups = { ultraWide: [], landscape: [], standard: [], portrait: [], tallPortrait: [] };

        state.images.forEach((d, i) => {
            const ar = d.aspectRatio;
            if (ar > 2.0) groups.ultraWide.push(i);
            else if (ar > 1.3) groups.landscape.push(i);
            else if (ar > 0.77) groups.standard.push(i);
            else if (ar > 0.5) groups.portrait.push(i);
            else groups.tallPortrait.push(i);
        });

        for (const k of Object.keys(groups)) {
            groups[k].sort((a, b) => state.images[a].aspectRatio - state.images[b].aspectRatio);
        }

        return [...groups.standard, ...groups.landscape, ...groups.portrait, ...groups.ultraWide, ...groups.tallPortrait];
    }

    function paginateImages() {
        const sorted = groupAndSortImages();
        const perPage = state.rows * state.cols;
        state.pages = [];
        for (let i = 0; i < sorted.length; i += perPage) {
            state.pages.push(sorted.slice(i, i + perPage));
        }
    }

    // ---- Rendering ----

    function getPageDims() {
        return state.orientation === 'landscape'
            ? { pageW: A3_WIDTH_MM, pageH: A3_HEIGHT_MM }
            : { pageW: A3_HEIGHT_MM, pageH: A3_WIDTH_MM };
    }

    function renderPage(indices) {
        const { pageW, pageH } = getPageDims();
        const { margin, padding, rows, cols } = state;

        const usableW = pageW - 2 * margin;
        const usableH = pageH - 2 * margin;
        const cellW = (usableW - (cols - 1) * padding) / cols;
        const cellH = (usableH - (rows - 1) * padding) / rows;

        const canvasW = Math.round(pageW * HIGH_DPI_SCALE * MM_TO_PT);
        const canvasH = Math.round(pageH * HIGH_DPI_SCALE * MM_TO_PT);
        const scale = canvasW / pageW;

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, canvasW, canvasH);

        for (let i = 0; i < indices.length; i++) {
            const d = state.images[indices[i]];
            if (!d) continue;

            const row = Math.floor(i / cols);
            const col = i % cols;
            const cellX = margin + col * (cellW + padding);
            const cellY = margin + row * (cellH + padding);

            const cellAR = cellW / cellH;
            let drawW, drawH;
            if (d.aspectRatio > cellAR) { drawW = cellW; drawH = cellW / d.aspectRatio; }
            else { drawH = cellH; drawW = cellH * d.aspectRatio; }

            const drawX = cellX + (cellW - drawW) / 2;
            const drawY = cellY + (cellH - drawH) / 2;

            ctx.drawImage(d.img, drawX * scale, drawY * scale, drawW * scale, drawH * scale);
        }

        return canvas;
    }

    async function renderAllPages() {
        showProgress('Generating collage…', 'Arranging images');
        state.canvases = [];
        await new Promise(r => setTimeout(r, 30));

        for (let i = 0; i < state.pages.length; i++) {
            state.canvases.push(renderPage(state.pages[i]));
            updateProgress(((i + 1) / state.pages.length) * 100, `Page ${i + 1} / ${state.pages.length}`);
            await new Promise(r => setTimeout(r, 5));
        }
        hideProgress();
    }

    // ---- PDF ----

    async function generatePDF(idx) {
        const { jsPDF } = window.jspdf;
        const { pageW, pageH } = getPageDims();
        const orient = state.orientation === 'landscape' ? 'l' : 'p';

        const pdf = new jsPDF({ orientation: orient, unit: 'mm', format: 'a3', compress: true });
        const pages = idx !== undefined ? [state.canvases[idx]] : state.canvases;

        showProgress('Generating PDF…', 'Encoding');

        for (let i = 0; i < pages.length; i++) {
            if (i > 0) pdf.addPage('a3', orient);
            const data = pages[i].toDataURL('image/jpeg', 0.95);
            pdf.addImage(data, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
            updateProgress(((i + 1) / pages.length) * 100, `Page ${i + 1} / ${pages.length}`);
            await new Promise(r => setTimeout(r, 5));
        }

        hideProgress();
        const name = idx !== undefined ? `a3-collage-page-${idx + 1}.pdf` : 'a3-collage.pdf';
        pdf.save(name);
        showToast(`Downloaded ${name}`, 'success');
    }

    // ---- UI ----

    function updateUI() {
        const n = state.images.length;
        dom.imageCount.textContent = `${n} image${n !== 1 ? 's' : ''}`;

        if (n > 0) {
            dom.uploadStatus.style.display = 'flex';
            dom.thumbnailStrip.style.display = 'flex';
            dom.configSection.style.display = 'block';
            renderThumbnails();
            updateSummary();
        } else {
            dom.uploadStatus.style.display = 'none';
            dom.thumbnailStrip.style.display = 'none';
            dom.configSection.style.display = 'none';
            dom.previewSection.style.display = 'none';
        }
    }

    function renderThumbnails() {
        dom.thumbnailStrip.innerHTML = '';
        const max = Math.min(state.images.length, 120);
        for (let i = 0; i < max; i++) {
            const img = document.createElement('img');
            img.src = state.images[i].url;
            img.alt = `Image ${i + 1}`;
            img.loading = 'lazy';
            dom.thumbnailStrip.appendChild(img);
        }
        if (state.images.length > 120) {
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;justify-content:center;min-width:44px;height:44px;border-radius:4px;background:#f2f2f2;color:#999;font-size:0.7rem;font-weight:600;flex-shrink:0;';
            el.textContent = `+${state.images.length - 120}`;
            dom.thumbnailStrip.appendChild(el);
        }
    }

    function updateSummary() {
        const pp = state.rows * state.cols;
        dom.summaryPages.textContent = Math.ceil(state.images.length / pp);
        dom.summaryImages.textContent = state.images.length;
        dom.gridTotal.textContent = pp;
    }

    function applyPreset(count) {
        const presets = state.orientation === 'landscape' ? GRID_PRESETS_LANDSCAPE : GRID_PRESETS_PORTRAIT;
        if (presets[count]) {
            [state.rows, state.cols] = presets[count];
            dom.inputRows.value = state.rows;
            dom.inputCols.value = state.cols;
        }
        updateSummary();
    }

    let userHasManuallyChangedPreset = false;

    function suggestBestConfig() {
        if (!userHasManuallyChangedPreset) {
            const best = 24;
            dom.presetChips.querySelectorAll('.chip').forEach(c =>
                c.classList.toggle('active', Number(c.dataset.count) === best)
            );
            applyPreset(best);
        }
    }

    function renderPreviews() {
        dom.previewGrid.innerHTML = '';

        for (let i = 0; i < state.canvases.length; i++) {
            const cv = state.canvases[i];

            const page = document.createElement('div');
            page.className = 'preview-page';

            const hdr = document.createElement('div');
            hdr.className = 'preview-page-header';

            const title = document.createElement('span');
            title.className = 'preview-page-title';
            title.textContent = `Page ${i + 1} of ${state.canvases.length}`;

            const dl = document.createElement('button');
            dl.className = 'btn';
            dl.textContent = `Download page ${i + 1}`;
            dl.addEventListener('click', () => generatePDF(i));

            hdr.appendChild(title);
            hdr.appendChild(dl);

            const wrap = document.createElement('div');
            wrap.className = 'preview-canvas-wrap';

            const disp = document.createElement('canvas');
            const dw = Math.min(1200, cv.width);
            const dh = Math.round(dw * (cv.height / cv.width));
            disp.width = dw;
            disp.height = dh;
            disp.getContext('2d').drawImage(cv, 0, 0, dw, dh);

            wrap.appendChild(disp);
            page.appendChild(hdr);
            page.appendChild(wrap);
            dom.previewGrid.appendChild(page);
        }
    }

    // ---- Events ----

    // Drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e =>
        dom.dropZone.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); })
    );
    dom.dropZone.addEventListener('dragenter', () => dom.dropZone.classList.add('drag-over'));
    dom.dropZone.addEventListener('dragover', () => dom.dropZone.classList.add('drag-over'));
    dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
    dom.dropZone.addEventListener('drop', e => {
        dom.dropZone.classList.remove('drag-over');
        const f = e.dataTransfer.files;
        (f.length === 1 && f[0].name.endsWith('.zip')) ? processZip(f[0]) : processFiles(f);
    });
    dom.dropZone.addEventListener('click', () => dom.inputImages.click());

    // Buttons
    dom.btnUploadImages.addEventListener('click', () => dom.inputImages.click());
    dom.btnUploadFolder.addEventListener('click', () => dom.inputFolder.click());
    dom.btnUploadZip.addEventListener('click', () => dom.inputZip.click());

    dom.inputImages.addEventListener('change', e => { if (e.target.files.length) processFiles(e.target.files); e.target.value = ''; });
    dom.inputFolder.addEventListener('change', e => { if (e.target.files.length) processFiles(e.target.files); e.target.value = ''; });
    dom.inputZip.addEventListener('change', e => { if (e.target.files.length) processZip(e.target.files[0]); e.target.value = ''; });

    dom.btnAddMore.addEventListener('click', () => dom.inputImages.click());
    dom.btnClearAll.addEventListener('click', () => {
        state.images.forEach(i => URL.revokeObjectURL(i.url));
        state.images = []; state.pages = []; state.canvases = [];
        userHasManuallyChangedPreset = false;
        applyPreset(24);
        dom.presetChips.querySelectorAll('.chip').forEach(c =>
            c.classList.toggle('active', Number(c.dataset.count) === 24)
        );
        dom.previewSection.style.display = 'none';
        updateUI();
        showToast('Cleared', 'info');
    });

    // Orientation
    dom.orientationToggle.addEventListener('click', e => {
        const btn = e.target.closest('.seg');
        if (!btn) return;
        dom.orientationToggle.querySelectorAll('.seg').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.orientation = btn.dataset.value;
        const ac = dom.presetChips.querySelector('.chip.active');
        if (ac) applyPreset(Number(ac.dataset.count));
        updateSummary();
    });

    // Presets
    dom.presetChips.addEventListener('click', e => {
        const c = e.target.closest('.chip');
        if (!c) return;
        userHasManuallyChangedPreset = true;
        dom.presetChips.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        applyPreset(Number(c.dataset.count));
    });

    // Manual grid
    dom.inputRows.addEventListener('input', () => {
        state.rows = Math.max(1, Math.min(12, parseInt(dom.inputRows.value) || 1));
        dom.inputRows.value = state.rows;
        userHasManuallyChangedPreset = true;
        syncChipHighlight();
        updateSummary();
    });

    dom.inputCols.addEventListener('input', () => {
        state.cols = Math.max(1, Math.min(12, parseInt(dom.inputCols.value) || 1));
        dom.inputCols.value = state.cols;
        userHasManuallyChangedPreset = true;
        syncChipHighlight();
        updateSummary();
    });

    function syncChipHighlight() {
        const pp = state.rows * state.cols;
        dom.presetChips.querySelectorAll('.chip').forEach(c =>
            c.classList.toggle('active', Number(c.dataset.count) === pp)
        );
    }

    // Sliders
    dom.inputPadding.addEventListener('input', () => {
        state.padding = parseFloat(dom.inputPadding.value);
        dom.paddingValue.textContent = state.padding + ' mm';
    });

    dom.inputMargin.addEventListener('input', () => {
        state.margin = parseInt(dom.inputMargin.value);
        dom.marginValue.textContent = state.margin + ' mm';
    });

    // Color
    dom.inputBgColor.addEventListener('input', () => {
        state.bgColor = dom.inputBgColor.value;
        dom.bgColorLabel.textContent = dom.inputBgColor.value.toUpperCase();
    });

    // Generate
    dom.btnGenerate.addEventListener('click', async () => {
        if (!state.images.length) { showToast('Upload images first', 'error'); return; }
        paginateImages();
        await renderAllPages();
        dom.previewSection.style.display = 'block';
        renderPreviews();
        dom.previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast(`${state.canvases.length} page${state.canvases.length !== 1 ? 's' : ''} ready`, 'success');
    });

    // Download
    dom.btnDownloadPdf.addEventListener('click', () => {
        if (!state.canvases.length) { showToast('Nothing to download', 'error'); return; }
        generatePDF();
    });

    // Init
    applyPreset(24);
    updateSummary();

})();
