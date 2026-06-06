// ==UserScript==
// @name         X 内容警告移除
// @namespace    https://github.com/SwordHand/x-tool
// @version      2.3
// @description  移除 X 敏感内容警告，支持本地下载视频、图片
// @author       SwordHand
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      video.twimg.com
// @connect      pbs.twimg.com
// @updateURL    https://raw.githubusercontent.com/SwordHand/x-tool/main/x-tool.user.js
// @downloadURL  https://raw.githubusercontent.com/SwordHand/x-tool/main/x-tool.user.js
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const mediaCache = new Map();

    const style = document.createElement('style');
    style.textContent = `
        #xbypass-indicator {
            position: fixed; top: 20px; right: 20px;
            width: 16px; height: 16px; border-radius: 50%;
            background: #00ff66; border: 2px solid #fff;
            box-shadow: 0 0 10px rgba(0,0,0,0.3);
            z-index: 9999999; cursor: pointer;
            transition: all 0.2s ease;
        }
        #xbypass-indicator[data-state="ok"] { background: #00ff66; box-shadow: 0 0 15px #00ff66; }
        #xbypass-indicator[data-state="err"] { background: #ff3333; box-shadow: 0 0 15px #ff3333; }

        .x-subtitle-download-btn-container {
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .x-subtitle-download-btn-container button {
            background: transparent;
            border: none;
            outline: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
            transition: background-color 0.2s ease;
            padding: 8px;
        }
        .x-subtitle-download-btn-container button:hover {
            background-color: rgba(29, 155, 240, 0.1);
        }
        .x-subtitle-download-btn-container button:hover svg {
            color: rgb(29, 155, 240) !important;
        }

        .x-download-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); z-index: 10000000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(2px);
        }
        .x-download-modal {
            background: #ffffff; border: 1px solid #cfd9de; color: #000000;
            border-radius: 16px; width: 360px; padding: 20px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .x-download-modal-title {
            margin: 0 0 16px 0; font-size: 18px; text-align: center; font-weight: bold;
            color: #000000;
        }
        .x-download-modal-scroll {
            max-height: 350px; overflow-y: auto; padding-right: 4px;
        }
        .x-download-video-section-title {
            font-size: 13px; font-weight: bold; color: #536471; margin: 12px 0 6px 0;
            padding-left: 2px;
        }
        .x-download-option-btn {
            background: #f7f9f9; border: 1px solid #cfd9de; color: #000000;
            border-radius: 8px; padding: 10px 12px; margin-bottom: 6px;
            cursor: pointer; text-align: left; width: 100%;
            transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;
            box-sizing: border-box;
        }
        .x-download-option-btn:hover {
            background: #eff1f1;
        }
        .x-download-option-res {
            font-weight: bold; color: #000000; font-size: 14px;
        }
        .x-download-option-bitrate {
            color: #000000; font-size: 13px; opacity: 0.7;
        }
        .x-download-modal-actions {
            display: flex; gap: 12px; margin-top: 12px; width: 100%; box-sizing: border-box;
        }
        .x-download-modal-close, .x-download-modal-all {
            border: none; border-radius: 9999px; padding: 12px 0; flex: 1;
            font-weight: bold; cursor: pointer; transition: background 0.2s;
            display: flex; justify-content: center; align-items: center; text-align: center;
            box-sizing: border-box;
        }
        .x-download-modal-close {
            background: #f7f9f9; color: #0f1419; border: 1px solid #cfd9de;
        }
        .x-download-modal-close:hover {
            background: #eff1f1;
        }
        .x-download-modal-all {
            background: #000000; color: #ffffff;
        }
        .x-download-modal-all:hover {
            background: #272c30;
        }
    `;
    document.documentElement.appendChild(style);

    const dot = document.createElement('div');
    dot.id = 'xbypass-indicator';
    dot.dataset.state = 'ok';
    dot.title = 'X 警告移除: ACTIVE';
    document.documentElement.appendChild(dot);

    let status = 'ok';

    function extractMediaInfo(obj) {
        if (!obj || typeof obj !== 'object') return;

        if (obj.legacy && obj.legacy.id_str && obj.legacy.extended_entities && obj.legacy.extended_entities.media) {
            const tweetId = obj.legacy.id_str;
            const collectedMedia = [];
            let videoIndex = 1;
            let photoIndex = 1;

            obj.legacy.extended_entities.media.forEach(mediaItem => {
                if (mediaItem.type === 'video' && mediaItem.video_info && mediaItem.video_info.variants) {
                    const mp4Variants = mediaItem.video_info.variants.filter(v => v.content_type === 'video/mp4' && v.bitrate);
                    if (mp4Variants.length > 0) {
                        collectedMedia.push({
                            type: 'video',
                            index: videoIndex++,
                            variants: mp4Variants
                        });
                    }
                } else if (mediaItem.type === 'photo' && mediaItem.media_url_https) {
                    const baseUrl = mediaItem.media_url_https;
                    const origUrl = baseUrl.includes('?') ? `${baseUrl}&name=orig` : `${baseUrl}?name=orig`;
                    collectedMedia.push({
                        type: 'photo',
                        index: photoIndex++,
                        url: origUrl,
                        originalInfo: mediaItem.original_info
                    });
                }
            });

            if (collectedMedia.length > 0) {
                mediaCache.set(tweetId, collectedMedia);
            }
        }

        for (let key in obj) {
            if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
                extractMediaInfo(obj[key]);
            }
        }
    }

    function deepClean(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        if (obj.mediaVisibilityResults) delete obj.mediaVisibilityResults;
        if (obj.limitedActionResults) delete obj.limitedActionResults;

        if (obj.tweet && typeof obj.tweet === 'object') {
            if (obj.tweet.possibly_sensitive !== undefined) {
                obj.tweet.possibly_sensitive = false;
            }
            if (obj.tweet.legacy) {
                obj.tweet.legacy.possibly_sensitive = false;
            }
        }

        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                obj[key] = deepClean(obj[key]);
            }
        }
        return obj;
    }

    const originalParse = targetWindow.JSON.parse;

    targetWindow.JSON.parse = function (text) {
        let result;
        try {
            result = originalParse.apply(this, arguments);

            if (result && typeof result === 'object') {
                extractMediaInfo(result);
                deepClean(result);
            }
        } catch (e) {
            status = 'err';
            dot.dataset.state = 'err';
            return originalParse.apply(this, arguments);
        }

        return result;
    };

    function showQualityDialog(mediaList, tweetId) {
        const overlay = document.createElement('div');
        overlay.className = 'x-download-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'x-download-modal';

        const title = document.createElement('h3');
        title.className = 'x-download-modal-title';
        title.textContent = '选择下载媒体文件';
        modal.appendChild(title);

        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'x-download-modal-scroll';

        mediaList.forEach((media) => {
            if (media.type === 'video') {
                if (mediaList.length > 1) {
                    const sectionTitle = document.createElement('div');
                    sectionTitle.className = 'x-download-video-section-title';
                    sectionTitle.textContent = `视频集 - 序号 ${media.index}`;
                    scrollContainer.appendChild(sectionTitle);
                }

                media.variants.forEach((item) => {
                    const resMatch = item.url.match(/(\d+x\d+)/);
                    const resolution = resMatch ? resMatch[1] : '未知尺寸';
                    const bitrateMbps = item.bitrate ? (item.bitrate / 1000000).toFixed(2) + ' Mbps' : '未知比特率';

                    const optBtn = document.createElement('button');
                    optBtn.className = 'x-download-option-btn';
                    optBtn.innerHTML = `
                        <span class="x-download-option-res">${resolution} (视频)</span>
                        <span class="x-download-option-bitrate">${bitrateMbps}</span>
                    `;

                    optBtn.addEventListener('click', () => {
                        const finalFilename = mediaList.length > 1
                            ? `X_Video_${tweetId}_Part${media.index}_${resolution}.mp4`
                            : `X_Video_${tweetId}_${resolution}.mp4`;

                        downloadFile(item.url, finalFilename);
                        closeModal();
                    });

                    scrollContainer.appendChild(optBtn);
                });
            } else if (media.type === 'photo') {
                const width = media.originalInfo?.width || '原图';
                const height = media.originalInfo?.height || '高清';
                const ext = media.url.split('.').pop().split('?')[0] || 'jpg';

                const optBtn = document.createElement('button');
                optBtn.className = 'x-download-option-btn';
                optBtn.innerHTML = `
                    <span class="x-download-option-res">图片 - 序号 ${media.index}</span>
                    <span class="x-download-option-bitrate">${width} x ${height}</span>
                `;

                optBtn.addEventListener('click', () => {
                    downloadFile(media.url, `X_Photo_${tweetId}_Part${media.index}.${ext}`);
                    closeModal();
                });

                scrollContainer.appendChild(optBtn);
            }
        });

        modal.appendChild(scrollContainer);

        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'x-download-modal-actions';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'x-download-modal-close';
        closeBtn.textContent = '取消';
        closeBtn.addEventListener('click', closeModal);
        actionsContainer.appendChild(closeBtn);

        if (mediaList.length > 1) {
            const allBtn = document.createElement('button');
            allBtn.className = 'x-download-modal-all';
            allBtn.textContent = '全部下载';
            allBtn.addEventListener('click', () => {
                mediaList.forEach((media) => {
                    if (media.type === 'video') {
                        const bestVariant = media.variants.reduce((prev, current) => (prev.bitrate > current.bitrate) ? prev : current);
                        const resMatch = bestVariant.url.match(/(\d+x\d+)/);
                        const resolution = resMatch ? resMatch[1] : 'best';
                        downloadFile(bestVariant.url, `X_Video_${tweetId}_Part${media.index}_${resolution}.mp4`);
                    } else if (media.type === 'photo') {
                        const ext = media.url.split('.').pop().split('?')[0] || 'jpg';
                        downloadFile(media.url, `X_Photo_${tweetId}_Part${media.index}.${ext}`);
                    }
                });
                closeModal();
            });
            actionsContainer.appendChild(allBtn);
        } else {
            closeBtn.style.background = '#000000';
            closeBtn.style.color = '#ffffff';
            closeBtn.style.border = 'none';
            closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = '#272c30');
            closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = '#000000');
        }

        modal.appendChild(actionsContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function closeModal() {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }
    }

    function downloadFile(url, filename) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            onload: function (response) {
                if (response.status === 200) {
                    const blob = response.response;
                    const blobUrl = window.URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();

                    window.URL.revokeObjectURL(blobUrl);
                    document.body.removeChild(a);
                } else {
                    fallbackDownload(url);
                }
            },
            onerror: function () {
                fallbackDownload(url);
            }
        });
    }

    function fallbackDownload(url) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
    }

    function addDownloadButton(actionBar, tweetId) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'css-175oi2r r-18u37iz r-1h0z5md r-13awgt0 x-subtitle-download-btn-container';

        const button = document.createElement('button');
        button.className = 'css-175oi2r r-1777fci r-bt1l66 r-bztko3 r-lrvibr r-1loqt21 r-1ny4l3l';
        button.type = 'button';
        button.setAttribute('aria-label', '下载媒体');
        button.title = '本地解析并下载媒体';

        const innerDiv = document.createElement('div');
        innerDiv.dir = 'ltr';
        innerDiv.className = 'css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-1h0z5md r-o7ynqc r-clp7b1 r-3s2u2q';
        innerDiv.style.color = 'rgb(83, 100, 113)';

        const svgWrapper = document.createElement('div');
        svgWrapper.className = 'css-175oi2r r-xoduu5';
        svgWrapper.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-1xvli5t r-1hdv0qi" style="width: 1.25em; height: 1.25em;">
                <g>
                    <path d="M12 16l-5-5h3V3h4v8h3l-5 5zm9 2H3v2h18v-2z" fill="currentColor"></path>
                </g>
            </svg>
        `;

        innerDiv.appendChild(svgWrapper);
        button.appendChild(innerDiv);
        btnContainer.appendChild(button);

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const cachedMediaList = mediaCache.get(tweetId);
            if (cachedMediaList && cachedMediaList.length > 0) {
                if (cachedMediaList.length === 1 && cachedMediaList[0].type === 'photo') {
                    const media = cachedMediaList[0];
                    const ext = media.url.split('.').pop().split('?')[0] || 'jpg';
                    downloadFile(media.url, `X_Photo_${tweetId}.${ext}`);
                } else {
                    showQualityDialog(cachedMediaList, tweetId);
                }
            } else {
                alert('未在本地缓存中匹配到该推文的媒体数据。请尝试刷新页面。');
            }
        });

        actionBar.appendChild(btnContainer);
    }

    function checkAndInjectSubtitleButtons() {
        const articles = document.querySelectorAll('article[role="article"]');

        articles.forEach(tweet => {
            if (tweet.dataset.downloadBtnAdded) return;

            const actionBar = tweet.querySelector('[role="group"]');
            if (!actionBar) return;

            const linkElement = tweet.querySelector('a[href*="/status/"]');
            if (!linkElement) return;

            const pathMatch = linkElement.getAttribute('href').match(/\/status\/(\d+)/);
            if (!pathMatch) return;

            const tweetId = pathMatch[1];

            const hasVideo = tweet.querySelector('[data-testid="videoComponent"]');
            const hasPhoto = tweet.querySelector('[data-testid="tweetPhoto"]');

            if (hasVideo || hasPhoto) {
                if (!actionBar.querySelector('.x-subtitle-download-btn-container')) {
                    addDownloadButton(actionBar, tweetId);
                }
                tweet.dataset.downloadBtnAdded = 'true';
            }
        });
    }

    const observer = new MutationObserver(() => {
        checkAndInjectSubtitleButtons();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    dot.addEventListener('click', function () {
        alert('X 成人内容警告移除\n\n状态: ' +
              (status === 'ok' ? '正常 ✅' : '异常 ❌') +
              `\n本地已解析缓存推文数: ${mediaCache.size}`);
    });
})();