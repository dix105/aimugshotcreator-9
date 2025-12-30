document.addEventListener('DOMContentLoaded', () => {
    
    /* =========================================
       HERO ANIMATION (CONFETTI)
       ========================================= */
    function initConfetti() {
        const container = document.getElementById('hero-animation');
        const colors = ['#FF69B4', '#98FF98', '#FFD700'];
        const particleCount = 20;

        for (let i = 0; i < particleCount; i++) {
            createParticle(container, colors);
        }
    }

    function createParticle(container, colors) {
        const particle = document.createElement('div');
        particle.classList.add('confetti');
        
        // Random properties
        const bg = colors[Math.floor(Math.random() * colors.length)];
        const left = Math.random() * 100 + '%';
        const delay = Math.random() * 5 + 's';
        const duration = (Math.random() * 5 + 5) + 's'; // 5-10s
        
        particle.style.backgroundColor = bg;
        particle.style.left = left;
        particle.style.animationDelay = delay;
        particle.style.animationDuration = duration;
        particle.style.top = '-20px'; // Start above screen
        
        container.appendChild(particle);

        // Reset after animation
        particle.addEventListener('animationend', () => {
            particle.remove();
            createParticle(container, colors);
        });
    }

    initConfetti();

    /* =========================================
       MOBILE MENU
       ========================================= */
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');

    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
        });

        // Close menu when clicking links
        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    /* =========================================
       BACKEND INTEGRATION & PLAYGROUND LOGIC
       ========================================= */
    
    // --- Configuration ---
    const CONFIG = {
        effectId: 'photoToVectorArt',
        model: 'image-effects', // 'image-effects' or 'video-effects'
        toolType: 'image-effects',
        userId: 'DObRu1vyStbUynoQmTcHBlhs55z2',
        apiUrl: 'https://api.chromastudio.ai',
        cdnUrl: 'https://contents.maxstudio.ai'
    };

    // --- State ---
    let currentUploadedUrl = null;

    // --- DOM Elements ---
    const fileInput = document.getElementById('file-input');
    const uploadZone = document.getElementById('upload-zone');
    const previewImage = document.getElementById('preview-image');
    const uploadContent = document.querySelector('.upload-content');
    const resetBtn = document.getElementById('reset-btn');
    const generateBtn = document.getElementById('generate-btn');
    
    const resultContainer = document.getElementById('result-container');
    const placeholderContent = document.querySelector('.placeholder-content');
    const loadingState = document.getElementById('loading-state');
    const resultFinal = document.getElementById('result-final');
    const downloadBtn = document.getElementById('download-btn');
    const statusTextElement = document.querySelector('.status-text') || document.createElement('span'); // Fallback if not in DOM

    // --- Backend Functions ---

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage (called immediately when file is selected)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension (no media/ prefix unless required)
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            `${CONFIG.apiUrl}/get-emd-upload-url?fileName=${encodeURIComponent(fileName)}`,
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = `${CONFIG.cdnUrl}/${fileName}`;
        return downloadUrl;
    }

    // Submit generation job (Image or Video)
    async function submitImageGenJob(imageUrl) {
        const isVideo = CONFIG.model === 'video-effects';
        const endpoint = isVideo ? `${CONFIG.apiUrl}/video-gen` : `${CONFIG.apiUrl}/image-gen`;
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            // Note: Browsers handle User-Agent, Sec-CH-UA automatically
        };

        // Construct payload
        let body = {};
        if (isVideo) {
            body = {
                imageUrl: [imageUrl],
                effectId: CONFIG.effectId,
                userId: CONFIG.userId,
                removeWatermark: true,
                model: 'video-effects',
                isPrivate: true
            };
        } else {
            body = {
                model: CONFIG.model,
                toolType: CONFIG.toolType,
                effectId: CONFIG.effectId,
                imageUrl: imageUrl,
                userId: CONFIG.userId,
                removeWatermark: true,
                isPrivate: true
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        return data;
    }

    // Poll job status until completed or failed
    async function pollJobStatus(jobId) {
        const isVideo = CONFIG.model === 'video-effects';
        const baseUrl = isVideo ? `${CONFIG.apiUrl}/video-gen` : `${CONFIG.apiUrl}/image-gen`;
        const POLL_INTERVAL = 2000; // 2 seconds
        const MAX_POLLS = 60; // Max 2 minutes
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${CONFIG.userId}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // --- UI Helper Functions ---

    function showLoading() {
        if (loadingState) loadingState.classList.remove('hidden');
        if (resultFinal) resultFinal.classList.add('hidden');
        if (placeholderContent) placeholderContent.classList.add('hidden');
        
        // Ensure container shows loading state
        if (resultContainer) resultContainer.classList.add('loading');
    }

    function hideLoading() {
        if (loadingState) loadingState.classList.add('hidden');
        if (resultContainer) resultContainer.classList.remove('loading');
    }

    function updateStatus(text) {
        if (generateBtn) {
            if (text === 'READY') {
                generateBtn.removeAttribute('disabled');
                generateBtn.textContent = 'Generate Vector Art';
            } else if (text === 'COMPLETE') {
                generateBtn.removeAttribute('disabled');
                generateBtn.textContent = 'Generate Vector Art';
            } else {
                generateBtn.setAttribute('disabled', 'true');
                generateBtn.textContent = text;
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg);
        updateStatus('READY'); // Reset button to allow retry
    }

    function showPreview(url) {
        if (previewImage) {
            previewImage.src = url;
            previewImage.classList.remove('hidden');
        }
        if (uploadContent) uploadContent.classList.add('hidden');
        if (resetBtn) resetBtn.classList.remove('hidden');
        
        updateStatus('READY');
    }

    function showResultMedia(url) {
        // Hide placeholder
        if (placeholderContent) placeholderContent.classList.add('hidden');
        
        // Determine media type
        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        
        if (isVideo) {
            if (resultFinal) resultFinal.style.display = 'none';
            
            let video = document.getElementById('result-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'result-video';
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                video.className = resultFinal ? resultFinal.className : 'w-full h-auto rounded-lg';
                if (resultFinal && resultFinal.parentElement) {
                    resultFinal.parentElement.appendChild(video);
                }
            }
            video.src = url;
            video.style.display = 'block';
        } else {
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            if (resultFinal) {
                resultFinal.style.display = 'block';
                resultFinal.classList.remove('hidden');
                resultFinal.crossOrigin = 'anonymous';
                // Add cache buster
                resultFinal.src = url + '?t=' + new Date().getTime();
            }
        }
    }

    function showDownloadButton(url) {
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.href = "#"; // Disable default link behavior
            downloadBtn.classList.remove('disabled');
        }
    }

    function resetUI() {
        currentUploadedUrl = null;
        if (fileInput) fileInput.value = '';
        if (previewImage) {
            previewImage.src = '';
            previewImage.classList.add('hidden');
        }
        if (uploadContent) uploadContent.classList.remove('hidden');
        if (resetBtn) resetBtn.classList.add('hidden');
        if (generateBtn) {
            generateBtn.setAttribute('disabled', 'true');
            generateBtn.textContent = 'Generate Vector Art';
        }
        
        // Reset Result Area
        if (resultFinal) resultFinal.classList.add('hidden');
        const video = document.getElementById('result-video');
        if (video) video.style.display = 'none';
        if (placeholderContent) placeholderContent.classList.remove('hidden');
        if (downloadBtn) {
            downloadBtn.classList.add('disabled');
            delete downloadBtn.dataset.url;
        }
        hideLoading();
    }

    // --- Main Logic Handlers ---

    // Handler when file is selected - uploads immediately
    async function handleFileSelect(file) {
        try {
            // UI: Show uploading state (using button text mostly)
            updateStatus('Uploading...');
            if (previewImage) previewImage.style.opacity = '0.5'; // Dim preview while uploading
            
            // Upload immediately
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Show the uploaded image preview
            if (previewImage) previewImage.style.opacity = '';
            showPreview(uploadedUrl);
            
        } catch (error) {
            if (previewImage) previewImage.style.opacity = '';
            console.error(error);
            showError("Upload failed: " + error.message);
            resetUI();
        }
    }

    // Handler when Generate button is clicked
    async function handleGenerate() {
        if (!currentUploadedUrl) return;
        
        try {
            showLoading();
            updateStatus('Processing...');
            
            // Step 1: Submit job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            // Step 2: Poll for completion
            const result = await pollJobStatus(jobData.jobId);
            
            // Step 3: Get result URL
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) {
                throw new Error('No output URL in response');
            }
            
            // Step 4: Display result
            showResultMedia(resultUrl);
            showDownloadButton(resultUrl);
            updateStatus('COMPLETE');
            hideLoading();
            
        } catch (error) {
            hideLoading();
            showError(error.message);
        }
    }

    // --- Event Wiring ---

    // File Input Change
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // Drag & Drop
    if (uploadZone) {
        uploadZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--primary)';
            uploadZone.style.backgroundColor = '#FFF5F9';
        });

        uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '';
            uploadZone.style.backgroundColor = '';
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '';
            uploadZone.style.backgroundColor = '';
            
            const file = e.dataTransfer.files[0];
            if (file) {
                if (fileInput) fileInput.files = e.dataTransfer.files; // Sync input
                handleFileSelect(file);
            }
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetUI();
        });
    }

    // Download Button - ROBUST IMPLEMENTATION
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault(); // Stop default link click
            
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.style.pointerEvents = 'none'; // Disable clicks
            
            try {
                // FORCE download by fetching as blob
                const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + new Date().getTime();
                const response = await fetch(fetchUrl, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (!response.ok) throw new Error('Network response was not ok');
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                // Determine extension
                const contentType = response.headers.get('content-type') || '';
                let extension = 'png'; // Default
                if (contentType.includes('jpeg') || url.match(/\.jpe?g/i)) extension = 'jpg';
                else if (contentType.includes('webp') || url.match(/\.webp/i)) extension = 'webp';
                else if (contentType.includes('mp4') || url.match(/\.mp4/i)) extension = 'mp4';
                
                // Trigger download
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `vector_art_${generateNanoId(8)}.${extension}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Cleanup
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
            } catch (err) {
                console.error('Download fetch failed, trying fallback:', err);
                
                // Fallback 1: Canvas (if image)
                try {
                    const img = document.getElementById('result-final');
                    if (img && img.style.display !== 'none' && img.complete && img.naturalWidth > 0) {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        
                        canvas.toBlob((blob) => {
                            if (blob) {
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(blob);
                                link.download = `vector_art_${generateNanoId(8)}.png`;
                                link.click();
                                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
                            } else {
                                throw new Error('Canvas blob failed');
                            }
                        }, 'image/png');
                        return; // Success
                    }
                } catch (canvasErr) {
                    console.error('Canvas fallback failed:', canvasErr);
                }

                // Fallback 2: New Tab
                alert('Direct download not supported by browser security settings. Opening in new tab - please right click and "Save As".');
                window.open(url, '_blank');
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.style.pointerEvents = 'auto';
            }
        });
    }

    /* =========================================
       FAQ ACCORDION
       ========================================= */
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            const isActive = question.classList.contains('active');
            
            // Close all others
            faqQuestions.forEach(q => {
                q.classList.remove('active');
                q.nextElementSibling.style.maxHeight = null;
            });
            
            // Toggle current
            if (!isActive) {
                question.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    /* =========================================
       SCROLL REVEAL
       ========================================= */
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    });
    
    revealElements.forEach(el => revealObserver.observe(el));

    /* =========================================
       MODALS
       ========================================= */
    const openModalBtns = document.querySelectorAll('[data-modal-target]');
    const closeModalBtns = document.querySelectorAll('[data-modal-close]');
    const modals = document.querySelectorAll('.modal');

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent bg scroll
        }
    }

    function closeModal(modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    openModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = btn.getAttribute('data-modal-target');
            openModal(modalId);
        });
    });

    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-modal-close');
            const modal = document.getElementById(modalId);
            closeModal(modal);
        });
    });

    // Close on click outside
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal);
            }
        });
    });
});